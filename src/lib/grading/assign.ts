import "server-only";
import { adminClient } from "@/lib/supabase/admin";
import type { Assignment, StemLength, Taxonomy } from "./rubric";

/*
 * The platform, not the student, picks what a question is about (Template 3.2): topic, domain, taxonomy and stem length.
 * Method 1 ("bank") aims at the student's weakest domain when there is enough data, otherwise the RENR blueprint;
 * method 2 ("practice") at the domain they missed most recently; method 3 ("review") at the topic review just read.
 * Taxonomy follows RENR's 20/50/30 (KC/AP/ASE) and stem length the 2:1:1:1 rule.
 */

export type AssignmentRow = Assignment & { id: string; domainId: number; topicId: number | null; reviewSlug: string | null };

const pick = <T,>(weighted: [T, number][]): T => {
  const total = weighted.reduce((a, [, w]) => a + w, 0);
  let r = Math.random() * total;
  for (const [v, w] of weighted) if ((r -= w) <= 0) return v;
  return weighted[weighted.length - 1][0];
};
const TAXONOMY: [Taxonomy, number][] = [["KC", 20], ["AP", 50], ["ASE", 30]];
const STEM: [StemLength, number][] = [["short", 2], ["medium", 1], ["medium_long", 1], ["long", 1]];

type Domain = { id: number; code: string; name: string; exam_weight_pct: number };
type Row = {
  id: string; method: Assignment["method"]; review_slug: string | null; domain_id: number; topic_id: number | null;
  topic: string; taxonomy: Taxonomy; stem_length: StemLength; domains: { code: string; name: string } | { code: string; name: string }[] | null;
};
const toAssignment = (r: Row): AssignmentRow => {
  const d = Array.isArray(r.domains) ? r.domains[0] : r.domains;
  return {
    id: r.id, method: r.method, reviewSlug: r.review_slug, domainId: r.domain_id, topicId: r.topic_id, topic: r.topic,
    taxonomy: r.taxonomy, stemLength: r.stem_length, domainCode: d?.code ?? "", domainName: d?.name ?? "",
  };
};
const SELECT = "id, method, review_slug, domain_id, topic_id, topic, taxonomy, stem_length, domains(code, name)";

/** Accuracy per domain over the student's last 60 answers; null when they have answered too little to tell. */
async function weakestDomain(userId: string): Promise<number | null> {
  const { data } = await adminClient.from("question_attempts").select("domain_id, is_correct").eq("user_id", userId)
    .order("answered_at", { ascending: false }).limit(60);
  const by = new Map<number, { n: number; ok: number }>();
  for (const a of (data ?? []) as { domain_id: number | null; is_correct: boolean }[]) {
    if (!a.domain_id) continue;
    const s = by.get(a.domain_id) ?? { n: 0, ok: 0 };
    s.n++; if (a.is_correct) s.ok++;
    by.set(a.domain_id, s);
  }
  const ranked = Array.from(by.entries()).filter(([, s]) => s.n >= 3).sort((a, b) => a[1].ok / a[1].n - b[1].ok / b[1].n);
  return ranked[0]?.[0] ?? null;
}

/** A real topic from the live bank in that domain (prefers one the student missed), or the domain itself. */
async function topicIn(domainId: number, userId: string, preferMissed: boolean): Promise<{ id: number | null; name: string } | null> {
  if (preferMissed) {
    const { data } = await adminClient.from("question_attempts").select("questions(topic_id, topics(name))")
      .eq("user_id", userId).eq("domain_id", domainId).eq("is_correct", false).order("answered_at", { ascending: false }).limit(1);
    const q = (data?.[0] as { questions?: { topic_id: number | null; topics: { name: string } | { name: string }[] | null } } | undefined)?.questions;
    const t = Array.isArray(q?.topics) ? q?.topics[0] : q?.topics;
    if (q?.topic_id && t?.name) return { id: q.topic_id, name: t.name };
  }
  const { data } = await adminClient.from("questions").select("topic_id, topics(name)").eq("domain_id", domainId)
    .eq("is_active", true).eq("context", "standalone").not("topic_id", "is", null).limit(200);
  const rows = (data ?? []) as { topic_id: number; topics: { name: string } | { name: string }[] | null }[];
  if (!rows.length) return null;
  const r = rows[Math.floor(Math.random() * rows.length)];
  const t = Array.isArray(r.topics) ? r.topics[0] : r.topics;
  return t?.name ? { id: r.topic_id, name: t.name } : null;
}

/**
 * The student's open assignment, or a new one. Asking for a different method or review replaces an unused one (they
 * haven't written anything for it yet); otherwise the same assignment comes back, so reloading can't reroll it.
 */
export async function getOrCreateAssignment(
  userId: string,
  want: { method: Assignment["method"]; review?: { slug: string; title: string } | null }
): Promise<AssignmentRow> {
  const { data: open } = await adminClient.from("qgen_assignments").select(SELECT).eq("user_id", userId).is("used_at", null).maybeSingle();
  if (open) {
    const o = open as unknown as Row;
    const same = o.method === want.method && (want.method !== "review" || o.review_slug === want.review?.slug);
    if (same || want.method === "bank") return toAssignment(o);
    await adminClient.from("qgen_assignments").delete().eq("id", o.id).is("used_at", null);
  }

  const { data: ds } = await adminClient.from("domains").select("id, code, name, exam_weight_pct").order("display_order");
  const domains = (ds ?? []) as Domain[];
  const blueprint = () => pick(domains.map((d) => [d.id, Number(d.exam_weight_pct)] as [number, number]));
  let domainId: number;
  let topic: { id: number | null; name: string } | null = null;
  if (want.method === "review" && want.review) {
    domainId = (await weakestDomain(userId)) ?? blueprint();
    topic = { id: null, name: want.review.title };
  } else if (want.method === "practice") {
    domainId = (await weakestDomain(userId)) ?? blueprint();
    topic = await topicIn(domainId, userId, true);
  } else {
    domainId = (await weakestDomain(userId)) ?? blueprint();
    topic = await topicIn(domainId, userId, false);
  }
  const d = domains.find((x) => x.id === domainId)!;
  const { data, error } = await adminClient.from("qgen_assignments").insert({
    user_id: userId, method: want.method, review_slug: want.method === "review" ? want.review?.slug ?? null : null,
    domain_id: domainId, topic_id: topic?.id ?? null, topic: topic?.name ?? d.name,
    taxonomy: pick(TAXONOMY), stem_length: pick(STEM),
  }).select(SELECT).single();
  if (error || !data) {
    // Two tabs racing: the other one won, so use its assignment.
    const { data: again } = await adminClient.from("qgen_assignments").select(SELECT).eq("user_id", userId).is("used_at", null).single();
    return toAssignment(again as unknown as Row);
  }
  return toAssignment(data as unknown as Row);
}

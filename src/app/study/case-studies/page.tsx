import Link from "next/link";
import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { DashboardShell } from "@/components/DashboardShell";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { canTakeCases } from "@/lib/case";

export const dynamic = "force-dynamic";

type Row = {
  id: string; title: string; setting: string | null; difficulty: string | null;
  domains: { name: string; code: string } | { name: string; code: string }[] | null;
};

export default async function CaseStudiesPage() {
  const { user, profile } = await requireRole("student", "/study/case-studies");
  const supabase = createClient();
  const allowed = canTakeCases(profile);

  // Titles describe the presenting situation, never the diagnosis (V3 s.3), so they are safe to list.
  const { data: rows } = await supabase
    .from("case_studies")
    .select("id, title, setting, difficulty, domains(name, code)")
    .eq("is_active", true)
    .order("created_at", { ascending: false });
  const cases = (rows ?? []) as unknown as Row[];

  const [{ data: links }, { data: attempts }] = await Promise.all([
    supabase.from("case_study_questions").select("case_study_id").in("case_study_id", cases.length ? cases.map((c) => c.id) : ["00000000-0000-0000-0000-000000000000"]),
    supabase.from("case_attempts").select("case_study_id, completed_at, score_pct, started_at").eq("student_id", user.id).order("started_at", { ascending: false }),
  ]);
  const count = (id: string) => (links ?? []).filter((l) => l.case_study_id === id).length;
  const status = (id: string) => {
    const mine = (attempts ?? []).filter((a) => a.case_study_id === id);
    if (mine.some((a) => !a.completed_at)) return { tone: "amber" as const, text: "In progress" };
    const best = mine.filter((a) => a.completed_at).map((a) => Number(a.score_pct ?? 0));
    return best.length ? { tone: "green" as const, text: `Best ${Math.round(Math.max(...best))}%` } : null;
  };

  return (
    <DashboardShell
      profile={profile}
      email={user.email}
      title="Case Studies"
      eyebrow="Clinical judgment"
      subtitle="Unfolding patient cases: recognise cues, prioritise, act, and evaluate as new information arrives. Rationales and a teaching review follow each case."
    >
      {!allowed ? (
        <p className="mb-4 rounded-md border border-brand-200 bg-brand-50 px-3 py-2 text-sm text-brand-900">
          Case studies are part of the Standard and Premium plans. You can browse the list; ask your administrator about upgrading to work through them.
        </p>
      ) : null}
      {cases.length === 0 ? (
        <EmptyState title="No case studies yet" body="Cases will appear here once your instructors publish them." />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {cases.map((cs) => {
            const domain = Array.isArray(cs.domains) ? cs.domains[0] : cs.domains;
            const st = status(cs.id);
            const n = count(cs.id);
            const card = (
              <Card className="flex h-full flex-col rounded-xl border-purple-100 transition-shadow hover:shadow-md">
                <div className="flex flex-wrap items-center gap-2">
                  {domain ? <Badge tone="purple">{domain.name}</Badge> : null}
                  {cs.difficulty ? <Badge tone="gray" className="capitalize">{cs.difficulty}</Badge> : null}
                  {st ? <Badge tone={st.tone}>{st.text}</Badge> : null}
                  {!allowed ? <Badge tone="gray">Locked</Badge> : null}
                </div>
                <h3 className="mt-3 font-heading font-semibold text-card-foreground group-hover:text-primary">{cs.title}</h3>
                {cs.setting ? <p className="mt-1 text-sm text-muted-foreground">{cs.setting}</p> : null}
                <p className="mt-auto pt-4 text-xs text-muted-foreground">{n} {n === 1 ? "question" : "questions"}</p>
              </Card>
            );
            return allowed ? (
              <Link key={cs.id} href={`/study/case-studies/${cs.id}`} className="group">{card}</Link>
            ) : (
              <div key={cs.id} className="opacity-70">{card}</div>
            );
          })}
        </div>
      )}
    </DashboardShell>
  );
}

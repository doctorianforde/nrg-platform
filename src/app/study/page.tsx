import Link from "next/link";
import Image from "next/image";
import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { DashboardShell } from "@/components/DashboardShell";
import { Card } from "@/components/ui/Card";
import { StatCard } from "@/components/ui/StatCard";

export const dynamic = "force-dynamic";

const MODES = [
  {
    href: "/study/practice",
    image: "/images/feature-practice.jpg",
    title: "Practice questions",
    body: "Tutor-mode practice with instant feedback, explanations and option rationales.",
  },
  {
    href: "/study/flashcards",
    image: "/images/topic-anatomy.jpg",
    title: "Flashcards",
    body: "Rapid-fire recall by topic — flip, shuffle, and drill weak areas.",
  },
  {
    href: "/study/case-studies",
    image: "/images/feature-instructor.jpg",
    title: "Case studies",
    body: "Clinical scenarios with linked questions — apply knowledge the RENR way.",
  },
  {
    href: "/study/mock-exams",
    image: "/images/feature-mockexam.jpg",
    title: "Mock exams",
    body: "Real exam format. No rationales until your teacher releases them.",
  },
];

export default async function StudyLobby() {
  const { user, profile } = await requireRole("student", "/study");
  const supabase = createClient();

  const { data: domains } = await supabase
    .from("domains")
    .select("id, name, code, exam_weight_pct")
    .order("display_order");

  const counts = await Promise.all(
    (domains ?? []).map((d) =>
      supabase
        .from("questions")
        .select("id", { count: "exact", head: true })
        .eq("is_active", true)
        .eq("domain_id", d.id)
        .then((r) => r.count ?? 0)
    )
  );
  const totalQuestions = counts.reduce((a, b) => a + b, 0);

  return (
    <DashboardShell
      profile={profile}
      email={user.email}
      title="Study dashboard"
      eyebrow="Student portal"
      subtitle="Practice questions, flashcards, case studies and mock exams — built around the 7 RENR domains."
    >
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Active questions"
          value={totalQuestions.toLocaleString()}
          iconTone="purple"
          icon={
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.6 9a3.4 3.4 0 1 1 4.9 3c-.9.5-1.5 1.1-1.5 2v.5M12 17.5h.01" />
              <circle cx="12" cy="12" r="9.25" />
            </svg>
          }
        />
        <StatCard
          label="RENR domains"
          value={domains?.length ?? 0}
          iconTone="blue"
          icon={
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5" aria-hidden="true">
              <rect x="3.5" y="3.5" width="7" height="7" rx="1.5" />
              <rect x="13.5" y="3.5" width="7" height="7" rx="1.5" />
              <rect x="3.5" y="13.5" width="7" height="7" rx="1.5" />
              <rect x="13.5" y="13.5" width="7" height="7" rx="1.5" />
            </svg>
          }
        />
        <StatCard
          label="Flashcards"
          value={<span className="text-lg">By topic →</span>}
          iconTone="amber"
          icon={
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5" aria-hidden="true">
              <rect x="3" y="7" width="14" height="12" rx="2" />
              <path strokeLinecap="round" d="M8 4.5h11A1.5 1.5 0 0 1 20.5 6v11" />
            </svg>
          }
        />
        <StatCard
          label="Mock exams"
          value={<span className="text-lg">Exam format →</span>}
          iconTone="green"
          icon={
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5" aria-hidden="true">
              <rect x="5" y="3.5" width="14" height="17" rx="2" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 3.5h6M9 12l2 2 4-4" />
            </svg>
          }
        />
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {MODES.map((m) => (
          <Link key={m.href} href={m.href} className="group">
            <Card interactive className="h-full overflow-hidden p-0">
              <div className="relative h-32 w-full overflow-hidden">
                <Image
                  src={m.image}
                  alt=""
                  fill
                  className="object-cover transition-transform duration-300 motion-safe:group-hover:scale-105"
                  sizes="(max-width: 640px) 100vw, 25vw"
                />
                <span
                  aria-hidden
                  className="pointer-events-none absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-card to-transparent"
                />
              </div>
              <div className="p-4">
                <h3 className="font-heading font-semibold text-card-foreground transition-colors group-hover:text-primary">
                  {m.title}{" "}
                  <span className="inline-block transition-transform duration-200 group-hover:translate-x-1">
                    →
                  </span>
                </h3>
                <p className="mt-1 text-sm text-muted-foreground">{m.body}</p>
              </div>
            </Card>
          </Link>
        ))}
      </div>

      <h2 className="mt-8 mb-3 font-heading text-lg font-semibold">Browse by RENR domain</h2>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {(domains ?? []).map((d, i) => (
          <Link key={d.id} href={`/study/practice?domain=${d.id}`} className="group">
            <Card interactive className="h-full">
              <div className="flex items-center justify-between gap-2">
                <span className="font-heading font-semibold text-card-foreground transition-colors group-hover:text-primary">
                  {d.name}
                </span>
                <span className="shrink-0 rounded-full bg-brand-100 px-2.5 py-0.5 text-xs font-semibold text-brand-800">
                  {d.code}
                </span>
              </div>
              <p className="mt-2 text-sm tabular-nums text-muted-foreground">
                {counts[i].toLocaleString()} practice questions
                {d.exam_weight_pct ? ` · ${d.exam_weight_pct}% of exam` : ""}
              </p>
              <div
                aria-hidden
                className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-muted"
              >
                <div
                  className="h-full rounded-full bg-gradient-to-r from-brand-400 to-brand-600"
                  style={{ width: `${Math.min(100, Number(d.exam_weight_pct ?? 0))}%` }}
                />
              </div>
            </Card>
          </Link>
        ))}
      </div>
    </DashboardShell>
  );
}

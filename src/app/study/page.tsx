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
    <DashboardShell profile={profile} email={user.email} title="Study dashboard">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Active questions" value={totalQuestions.toLocaleString()} />
        <StatCard label="RENR domains" value={domains?.length ?? 0} />
        <StatCard label="Flashcards" value={<span className="text-lg">By topic →</span>} />
        <StatCard label="Mock exams" value={<span className="text-lg">Exam format →</span>} />
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {MODES.map((m) => (
          <Link key={m.href} href={m.href} className="group">
            <Card className="h-full overflow-hidden p-0 transition-shadow hover:shadow-md">
              <div className="relative h-32 w-full">
                <Image
                  src={m.image}
                  alt=""
                  fill
                  className="object-cover"
                  sizes="(max-width: 640px) 100vw, 25vw"
                />
              </div>
              <div className="p-4">
                <h3 className="font-heading font-semibold text-card-foreground group-hover:text-primary">
                  {m.title} →
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
          <Link key={d.id} href={`/study/practice?domain=${d.id}`}>
            <Card className="transition-shadow hover:shadow-md">
              <div className="flex items-center justify-between">
                <span className="font-heading font-semibold text-card-foreground">{d.name}</span>
                <span className="rounded bg-brand-100 px-2 py-0.5 text-xs font-semibold text-brand-800">
                  {d.code}
                </span>
              </div>
              <p className="mt-2 text-sm text-muted-foreground">
                {counts[i].toLocaleString()} practice questions
                {d.exam_weight_pct ? ` · ${d.exam_weight_pct}% of exam` : ""}
              </p>
            </Card>
          </Link>
        ))}
      </div>
    </DashboardShell>
  );
}

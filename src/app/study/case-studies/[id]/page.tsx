import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { DashboardShell } from "@/components/DashboardShell";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { TutorSession } from "@/components/questions/TutorSession";
import { fetchQuizQuestions } from "@/lib/quiz/fetch";

export const dynamic = "force-dynamic";

type CaseStudyRow = {
  id: string;
  clinical_scenario: string;
  is_active: boolean;
  domains: { name: string } | { name: string }[] | null;
};

function PersonIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-5 w-5 text-brand-700"
      aria-hidden="true"
    >
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c0-4 3.6-6 8-6s8 2 8 6" />
    </svg>
  );
}

export default async function CaseStudyPage({ params }: { params: { id: string } }) {
  const { user, profile } = await requireRole("student", `/study/case-studies/${params.id}`);
  const supabase = createClient();

  const { data: row } = await supabase
    .from("case_studies")
    .select("id, clinical_scenario, is_active, domains(name)")
    .eq("id", params.id)
    .maybeSingle();

  const caseStudy = row as unknown as CaseStudyRow | null;
  if (!caseStudy || !caseStudy.is_active) notFound();

  const { data: links } = await supabase
    .from("case_study_questions")
    .select("question_id")
    .eq("case_study_id", caseStudy.id)
    .order("display_order");

  const ids = (links ?? []).map((l) => l.question_id);
  const questions = ids.length > 0 ? await fetchQuizQuestions({ ids, preserveOrder: true }) : [];

  const domain = Array.isArray(caseStudy.domains) ? caseStudy.domains[0] : caseStudy.domains;

  return (
    <DashboardShell
      profile={profile}
      email={user.email}
      title="Case Study Simulation"
      eyebrow={domain?.name ?? "Clinical simulation"}
      subtitle="Work through the scenario, then answer each decision point with detailed feedback."
    >
      <Link
        href="/study/case-studies"
        className="mb-4 inline-block rounded-lg px-3 py-1.5 text-sm font-medium text-brand-700 hover:bg-brand-50"
      >
        ← All case studies
      </Link>

      {questions.length === 0 ? (
        <EmptyState
          title="This case study has no active questions yet"
          body="The linked questions may still be under review. Check back soon."
          action={
            <Link
              href="/study/case-studies"
              className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-brand-800"
            >
              All case studies
            </Link>
          }
        />
      ) : (
        <div className="space-y-6">
          {/* Reference detail view: white card with 4px left purple accent */}
          <div className="rounded-xl border border-purple-100 border-l-4 border-l-brand-700 bg-card p-6 shadow-sm">
            <div className="flex items-center gap-2">
              <PersonIcon />
              <h2 className="font-heading font-semibold text-card-foreground">Case Scenario</h2>
              {domain ? <Badge tone="purple">{domain.name}</Badge> : null}
            </div>
            <p className="mt-4 whitespace-pre-line text-base leading-relaxed text-card-foreground">
              {caseStudy.clinical_scenario}
            </p>
          </div>

          {/*
            The scenario is rendered above as the accent-bordered card, so intro
            is intentionally not passed — TutorSession renders its own intro box
            at question 1, which would duplicate it.
          */}
          <TutorSession
            questions={questions}
            title={domain?.name ? `Case study · ${domain.name}` : "Case study"}
            backHref="/study/case-studies"
            backLabel="All case studies"
          />
        </div>
      )}
    </DashboardShell>
  );
}

import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { DashboardShell } from "@/components/DashboardShell";
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

  const domain = Array.isArray(caseStudy.domains)
    ? caseStudy.domains[0]
    : caseStudy.domains;

  return (
    <DashboardShell profile={profile} email={user.email} title="Case study">
      {questions.length === 0 ? (
        <EmptyState
          title="This case study has no active questions yet"
          body="The linked questions may still be under review. Check back soon."
          action={
            <Link
              href="/study/case-studies"
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-brand-800"
            >
              All case studies
            </Link>
          }
        />
      ) : (
        <TutorSession
          questions={questions}
          intro={caseStudy.clinical_scenario}
          title={domain?.name ? `Case study · ${domain.name}` : "Case study"}
          backHref="/study/case-studies"
          backLabel="All case studies"
        />
      )}
    </DashboardShell>
  );
}

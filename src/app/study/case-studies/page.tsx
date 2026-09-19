import Link from "next/link";
import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { DashboardShell } from "@/components/DashboardShell";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";

export const dynamic = "force-dynamic";

type CaseStudyRow = {
  id: string;
  clinical_scenario: string;
  created_at: string;
  domains: { name: string; code: string } | { name: string; code: string }[] | null;
};

function firstLine(text: string): string {
  return text.trim().split("\n")[0].trim();
}

function MetaIcon({ children }: { children: React.ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-4 w-4 shrink-0"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

export default async function CaseStudiesPage() {
  const { user, profile } = await requireRole("student", "/study/case-studies");
  const supabase = createClient();

  const { data: rows } = await supabase
    .from("case_studies")
    .select("id, clinical_scenario, created_at, domains(name, code)")
    .eq("is_active", true)
    .order("created_at", { ascending: false });

  const caseStudies = (rows ?? []) as unknown as CaseStudyRow[];

  const linkCounts = await Promise.all(
    caseStudies.map((cs) =>
      supabase
        .from("case_study_questions")
        .select("question_id", { count: "exact", head: true })
        .eq("case_study_id", cs.id)
        .then((r) => r.count ?? 0)
    )
  );

  return (
    <DashboardShell
      profile={profile}
      email={user.email}
      title="Case Study Simulations"
      eyebrow="Clinical simulations"
      subtitle="Interactive clinical scenarios designed for professional development. Progress through real patient cases with decision points and detailed feedback."
    >
      {caseStudies.length === 0 ? (
        <EmptyState
          title="No case studies yet"
          body="Clinical scenarios with linked questions will appear here once your instructors publish them."
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {caseStudies.map((cs, i) => {
            const domain = Array.isArray(cs.domains) ? cs.domains[0] : cs.domains;
            const count = linkCounts[i];
            return (
              <Link key={cs.id} href={`/study/case-studies/${cs.id}`} className="group">
                <Card className="flex h-full flex-col rounded-xl border-purple-100 transition-shadow hover:shadow-md">
                  <div className="flex flex-wrap items-center gap-2">
                    {domain ? (
                      <Badge tone="purple">{domain.name}</Badge>
                    ) : (
                      <Badge tone="gray">General</Badge>
                    )}
                    <Badge tone="gray" className="bg-purple-50 text-brand-700">
                      {count === 1 ? "1 decision point" : `${count} decision points`}
                    </Badge>
                  </div>
                  <h3 className="mt-3 font-heading font-semibold text-card-foreground group-hover:text-primary">
                    {firstLine(cs.clinical_scenario)}
                  </h3>
                  <p className="mt-2 line-clamp-3 whitespace-pre-line text-sm text-muted-foreground">
                    {cs.clinical_scenario}
                  </p>
                  <div className="mt-auto flex items-center gap-4 pt-4 text-xs text-muted-foreground">
                    <span className="inline-flex items-center gap-1.5">
                      <MetaIcon>
                        <rect x="8" y="2" width="8" height="4" rx="1" />
                        <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
                        <path d="M9 12h6M9 16h4" />
                      </MetaIcon>
                      {count} {count === 1 ? "question" : "questions"}
                    </span>
                    {domain ? (
                      <span className="inline-flex items-center gap-1.5">
                        <MetaIcon>
                          <path d="M12 2 2 7l10 5 10-5-10-5Z" />
                          <path d="M2 17l10 5 10-5" />
                          <path d="M2 12l10 5 10-5" />
                        </MetaIcon>
                        {domain.code}
                      </span>
                    ) : null}
                  </div>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </DashboardShell>
  );
}

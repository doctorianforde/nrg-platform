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

function preview(text: string, max = 200): string {
  const trimmed = text.trim();
  return trimmed.length > max ? `${trimmed.slice(0, max).trimEnd()}…` : trimmed;
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
    <DashboardShell profile={profile} email={user.email} title="Case studies">
      {caseStudies.length === 0 ? (
        <EmptyState
          title="No case studies yet"
          body="Clinical scenarios with linked questions will appear here once your instructors publish them."
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {caseStudies.map((cs, i) => {
            const domain = Array.isArray(cs.domains) ? cs.domains[0] : cs.domains;
            return (
              <Link key={cs.id} href={`/study/case-studies/${cs.id}`} className="group">
                <Card className="flex h-full flex-col transition-shadow hover:shadow-md">
                  <div className="flex items-center justify-between gap-2">
                    {domain ? (
                      <Badge tone="purple">
                        {domain.code} · {domain.name}
                      </Badge>
                    ) : (
                      <Badge tone="gray">General</Badge>
                    )}
                    <span className="text-xs text-muted-foreground">
                      {linkCounts[i] === 1 ? "1 question" : `${linkCounts[i]} questions`}
                    </span>
                  </div>
                  <p className="mt-3 whitespace-pre-line text-sm text-card-foreground">
                    {preview(cs.clinical_scenario)}
                  </p>
                  <span className="mt-auto pt-4 text-sm font-medium text-primary group-hover:underline">
                    Start case study →
                  </span>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </DashboardShell>
  );
}

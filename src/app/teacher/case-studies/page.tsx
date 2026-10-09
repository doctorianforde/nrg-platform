import Link from "next/link";
import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { DashboardShell } from "@/components/DashboardShell";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";

export const dynamic = "force-dynamic";

const STATUS_TONE = { draft: "gray", in_review: "amber", approved: "green", archived: "gray" } as const;

export default async function TeacherCaseStudiesPage() {
  const { user, profile } = await requireRole("teacher", "/teacher/case-studies");
  const supabase = createClient();
  const { data } = await supabase
    .from("case_studies")
    .select("id, case_code, title, primary_condition, status, is_active, validation_status, difficulty, source, updated_at, domains(code)")
    .order("updated_at", { ascending: false });
  const cases = (data ?? []) as unknown as Array<{
    id: string; case_code: string | null; title: string; primary_condition: string | null; status: keyof typeof STATUS_TONE;
    is_active: boolean; validation_status: string; difficulty: string | null; source: string | null; domains: { code: string } | null;
  }>;

  return (
    <DashboardShell profile={profile} email={user.email} title="Case studies" eyebrow="Teaching" subtitle="Review, validate and publish unfolding case studies. A case reaches students only after clinical validation.">
      {cases.length === 0 ? (
        <EmptyState title="No cases yet" body="Cases are imported with scripts/import-case.ts and appear here for review." />
      ) : (
        <Card className="p-0">
          <table className="w-full text-sm">
            <thead className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr><th className="px-4 py-2">Case</th><th className="px-4 py-2">Condition</th><th className="px-4 py-2">Status</th><th className="px-4 py-2">Validation</th><th className="px-4 py-2">Source</th></tr>
            </thead>
            <tbody>
              {cases.map((c) => (
                <tr key={c.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-2">
                    <Link href={`/teacher/case-studies/${c.id}`} className="font-medium text-primary hover:underline">{c.title}</Link>
                    <div className="text-xs text-muted-foreground">{c.case_code} · {c.domains?.code ?? "—"} · {c.difficulty ?? "—"}</div>
                  </td>
                  <td className="px-4 py-2 text-muted-foreground">{c.primary_condition}</td>
                  <td className="px-4 py-2">
                    <Badge tone={STATUS_TONE[c.status] ?? "gray"}>{c.status.replace("_", " ")}</Badge>{" "}
                    {c.is_active ? <Badge tone="green">Live</Badge> : null}
                  </td>
                  <td className="px-4 py-2"><Badge tone={c.validation_status === "validated" ? "green" : "amber"}>{c.validation_status}</Badge></td>
                  <td className="px-4 py-2 text-muted-foreground">{c.source}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </DashboardShell>
  );
}

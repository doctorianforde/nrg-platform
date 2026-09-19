import Link from "next/link";
import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/types";
import { DashboardShell } from "@/components/DashboardShell";
import { Card, CardTitle } from "@/components/ui/Card";
import { StatCard } from "@/components/ui/StatCard";

export const dynamic = "force-dynamic";

type TableName = keyof Database["public"]["Tables"];

function count(supabase: ReturnType<typeof createClient>, table: TableName) {
  return supabase
    .from(table)
    .select("id", { count: "exact", head: true })
    .then((r) => r.count ?? 0);
}

export default async function Page() {
  const { user, profile } = await requireRole("super_admin", "/super-admin");
  const supabase = createClient();

  const [
    totalUsers,
    totalQuestions,
    examSets,
    examSessions,
    caseStudies,
    flashcards,
    domains,
    topics,
    aiPending,
  ] = await Promise.all([
    count(supabase, "profiles"),
    count(supabase, "questions"),
    count(supabase, "mock_exam_sets"),
    count(supabase, "mock_exam_sessions"),
    count(supabase, "case_studies"),
    count(supabase, "flashcards"),
    count(supabase, "domains"),
    count(supabase, "topics"),
    supabase
      .from("questions")
      .select("id", { count: "exact", head: true })
      .eq("is_ai_generated", true)
      .eq("review_status", "pending")
      .then((r) => r.count ?? 0),
  ]);

  return (
    <DashboardShell profile={profile} email={user.email} title="Super admin">
      <h2 className="mb-3 font-heading text-lg font-semibold">Platform overview</h2>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Users" value={totalUsers.toLocaleString()} />
        <StatCard
          label="Questions"
          value={totalQuestions.toLocaleString()}
          hint={`${aiPending.toLocaleString()} AI-generated awaiting review`}
        />
        <StatCard
          label="Mock exam sets"
          value={examSets.toLocaleString()}
          hint={`${examSessions.toLocaleString()} sessions taken`}
        />
        <StatCard
          label="Content"
          value={caseStudies + flashcards}
          hint={`${caseStudies.toLocaleString()} case studies · ${flashcards.toLocaleString()} flashcards`}
        />
        <StatCard
          label="Domains"
          value={domains.toLocaleString()}
          hint={`${topics.toLocaleString()} topics`}
        />
      </div>

      <div className="mt-8 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardTitle>Environments</CardTitle>
          <dl className="mt-4 space-y-3 text-sm">
            <div className="flex items-center justify-between">
              <dt className="text-muted-foreground">Production</dt>
              <dd className="font-mono text-xs text-card-foreground">cdvubijjepwmhhkgppbl</dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="text-muted-foreground">Staging</dt>
              <dd className="font-mono text-xs text-card-foreground">kwhaqhhwqykckarjbdod</dd>
            </div>
          </dl>
          <p className="mt-4 text-sm text-muted-foreground">
            Every schema change and content migration goes to <strong>staging first</strong>, then
            prod — never run migrations on prod without a clean dry-run on staging.
          </p>
        </Card>

        <Link href="/admin" className="group">
          <Card className="h-full transition-shadow hover:shadow-md">
            <CardTitle className="group-hover:text-primary">Admin dashboard →</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              User counts, recent signups, and per-domain content overview. Read-only.
            </p>
          </Card>
        </Link>
      </div>
    </DashboardShell>
  );
}

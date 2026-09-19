import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/types";
import { DashboardShell } from "@/components/DashboardShell";
import { Card, CardTitle } from "@/components/ui/Card";
import { Badge, type BadgeTone } from "@/components/ui/Badge";
import { StatCard } from "@/components/ui/StatCard";
import { EmptyState } from "@/components/ui/EmptyState";

export const dynamic = "force-dynamic";

const ROLE_TONE: Record<string, BadgeTone> = {
  student: "blue",
  teacher: "purple",
  admin: "amber",
  super_admin: "red",
};

type TableName = keyof Database["public"]["Tables"];

function count(supabase: ReturnType<typeof createClient>, table: TableName) {
  return supabase
    .from(table)
    .select("id", { count: "exact", head: true })
    .then((r) => r.count ?? 0);
}

export default async function Page() {
  const { user, profile } = await requireRole("admin", "/admin");
  const supabase = createClient();

  const countWhere = (
    table: TableName,
    column: string,
    value: boolean | string
  ) =>
    supabase
      .from(table)
      .select("id", { count: "exact", head: true })
      .eq(column, value)
      .then((r) => r.count ?? 0);

  const [
    totalUsers,
    students,
    teachers,
    admins,
    superAdmins,
    totalQuestions,
    activeQuestions,
    inactiveQuestions,
    aiPending,
    examSets,
    examSessions,
    flashcards,
    caseStudies,
  ] = await Promise.all([
    count(supabase, "profiles"),
    countWhere("profiles", "role", "student"),
    countWhere("profiles", "role", "teacher"),
    countWhere("profiles", "role", "admin"),
    countWhere("profiles", "role", "super_admin"),
    count(supabase, "questions"),
    countWhere("questions", "is_active", true),
    countWhere("questions", "is_active", false),
    supabase
      .from("questions")
      .select("id", { count: "exact", head: true })
      .eq("is_ai_generated", true)
      .eq("review_status", "pending")
      .then((r) => r.count ?? 0),
    count(supabase, "mock_exam_sets"),
    count(supabase, "mock_exam_sessions"),
    count(supabase, "flashcards"),
    count(supabase, "case_studies"),
  ]);

  const { data: domains } = await supabase
    .from("domains")
    .select("id, name, code")
    .order("display_order");

  const domainCounts = await Promise.all(
    (domains ?? []).map((d) =>
      supabase
        .from("questions")
        .select("id", { count: "exact", head: true })
        .eq("domain_id", d.id)
        .then((r) => r.count ?? 0)
    )
  );

  const { data: recentProfiles } = await supabase
    .from("profiles")
    .select("id, full_name, role, subscription_tier, created_at")
    .order("created_at", { ascending: false })
    .limit(10);

  return (
    <DashboardShell profile={profile} email={user.email} title="Admin dashboard">
      <h2 className="mb-3 font-heading text-lg font-semibold">Users</h2>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <StatCard label="Total users" value={totalUsers.toLocaleString()} />
        <StatCard label="Students" value={students.toLocaleString()} />
        <StatCard label="Teachers" value={teachers.toLocaleString()} />
        <StatCard label="Admins" value={admins.toLocaleString()} />
        <StatCard label="Super admins" value={superAdmins.toLocaleString()} />
      </div>

      <h2 className="mt-8 mb-3 font-heading text-lg font-semibold">Content</h2>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <StatCard
          label="Questions"
          value={totalQuestions.toLocaleString()}
          hint={`${activeQuestions.toLocaleString()} active · ${inactiveQuestions.toLocaleString()} inactive`}
        />
        <StatCard
          label="AI review pending"
          value={aiPending.toLocaleString()}
          hint="AI-generated, awaiting teacher review"
        />
        <StatCard
          label="Mock exam sets"
          value={examSets.toLocaleString()}
          hint={`${examSessions.toLocaleString()} sessions taken`}
        />
        <StatCard label="Flashcards" value={flashcards.toLocaleString()} />
        <StatCard label="Case studies" value={caseStudies.toLocaleString()} />
      </div>

      <div className="mt-8 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardTitle>Recent signups</CardTitle>
          {recentProfiles && recentProfiles.length > 0 ? (
            <ul className="mt-4 divide-y divide-border">
              {recentProfiles.map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-3 py-2.5">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-card-foreground">
                      {p.full_name ?? p.id}
                      {p.full_name ? null : (
                        <span className="ml-1 text-xs text-muted-foreground">(no name set)</span>
                      )}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Joined{" "}
                      {new Date(p.created_at).toLocaleDateString("en", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Badge tone={ROLE_TONE[p.role] ?? "gray"}>{p.role}</Badge>
                    <Badge tone={p.subscription_tier === "free" ? "gray" : "green"}>
                      {p.subscription_tier}
                    </Badge>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState title="No signups yet" body="New signups will appear here." />
          )}
        </Card>

        <Card>
          <CardTitle>Questions per domain</CardTitle>
          <ul className="mt-4 divide-y divide-border">
            {(domains ?? []).map((d, i) => (
              <li key={d.id} className="flex items-center justify-between py-2.5">
                <span className="flex items-center gap-2 text-sm text-card-foreground">
                  {d.name}
                  <span className="rounded bg-brand-100 px-1.5 py-0.5 text-xs font-semibold text-brand-800">
                    {d.code}
                  </span>
                </span>
                <span className="font-medium text-card-foreground">
                  {domainCounts[i].toLocaleString()}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-muted-foreground">
            Flashcards: {flashcards.toLocaleString()} · Case studies: {caseStudies.toLocaleString()}
          </p>
        </Card>
      </div>
    </DashboardShell>
  );
}

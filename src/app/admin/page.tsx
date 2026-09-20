import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/types";
import { DashboardShell } from "@/components/DashboardShell";
import { Card, CardTitle } from "@/components/ui/Card";
import { Badge, type BadgeTone } from "@/components/ui/Badge";
import { StatCard } from "@/components/ui/StatCard";
import { EmptyState } from "@/components/ui/EmptyState";
import { cn } from "@/lib/cn";
import { loadAccounts, loadPendingRequests } from "@/lib/admin/queries";
import { RequestActions } from "@/components/admin/RequestActions";
import { AccountActions } from "@/components/admin/AccountActions";
import { fmtDateTime } from "@/lib/mock-exam/utils";
import { Avatar } from "@/components/ui/Avatar";

export const dynamic = "force-dynamic";

const ROLE_TONE: Record<string, BadgeTone> = {
  student: "blue",
  teacher: "purple",
  admin: "amber",
  super_admin: "red",
};

const AVATAR_TONE = [
  "bg-brand-100 text-brand-700",
  "bg-blue-100 text-blue-700",
  "bg-green-100 text-green-700",
  "bg-amber-100 text-amber-700",
];

type TableName = keyof Database["public"]["Tables"];

function count(supabase: ReturnType<typeof createClient>, table: TableName) {
  return supabase
    .from(table)
    .select("id", { count: "exact", head: true })
    .then((r) => r.count ?? 0);
}

function Icon({ children }: { children: React.ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-5 w-5"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

const UsersIcon = () => (
  <Icon>
    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
  </Icon>
);

const GradCapIcon = () => (
  <Icon>
    <path d="M22 10 12 5 2 10l10 5 10-5z" />
    <path d="M6 12v5c0 1.66 2.69 3 6 3s6-1.34 6-3v-5" />
    <line x1="22" y1="10" x2="22" y2="16" />
  </Icon>
);

const ShieldIcon = () => (
  <Icon>
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
  </Icon>
);

const CrownIcon = () => (
  <Icon>
    <path d="M2 18h20" />
    <path d="M3 18 2 7l6 5 4-8 4 8 6-5-1 11H3z" />
  </Icon>
);

const HelpCircleIcon = () => (
  <Icon>
    <circle cx="12" cy="12" r="10" />
    <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
    <line x1="12" y1="17" x2="12.01" y2="17" />
  </Icon>
);

const SparklesIcon = () => (
  <Icon>
    <path d="M12 3l1.9 5.8L19.7 10l-5.8 1.9L12 17.7l-1.9-5.8L4.3 10l5.8-1.9L12 3z" />
    <path d="M19 3.5l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7.7-2z" />
  </Icon>
);

const ClipboardIcon = () => (
  <Icon>
    <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
    <rect x="8" y="2" width="8" height="4" rx="1" />
  </Icon>
);

const LayersIcon = () => (
  <Icon>
    <polygon points="12 2 2 7 12 12 22 7 12 2" />
    <polyline points="2 17 12 22 22 17" />
    <polyline points="2 12 12 17 22 12" />
  </Icon>
);

const FileTextIcon = () => (
  <Icon>
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <polyline points="14 2 14 8 20 8" />
    <line x1="16" y1="13" x2="8" y2="13" />
    <line x1="16" y1="17" x2="8" y2="17" />
  </Icon>
);

function initials(name: string | null): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : ""))
    .toUpperCase()
    .slice(0, 2);
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

  const [pendingRequests, accounts] = await Promise.all([
    loadPendingRequests(),
    loadAccounts(),
  ]);
  const isSuper = profile.role === "super_admin";

  const { data: recentProfiles } = await supabase
    .from("profiles")
    .select("id, full_name, role, subscription_tier, created_at")
    .order("created_at", { ascending: false })
    .limit(10);

  return (
    <DashboardShell
      profile={profile}
      email={user.email}
      title="Admin dashboard"
      eyebrow="Administration"
      subtitle="Approve teacher accounts, manage people, and review platform usage."
    >
      <h2 className="mb-3 font-heading text-lg font-semibold">
        Teacher access requests
        {pendingRequests.length > 0 ? (
          <Badge tone="amber" className="ml-2 align-middle">
            {pendingRequests.length} waiting
          </Badge>
        ) : null}
      </h2>
      <Card className="mb-8 rounded-xl border-brand-100">
        {pendingRequests.length === 0 ? (
          <EmptyState
            title="Nothing waiting"
            body="When someone signs up and asks for a teacher account, it appears here for you to approve or deny."
          />
        ) : (
          <ul className="divide-y divide-border">
            {pendingRequests.map((r) => (
              <li key={r.id} className="py-4 first:pt-0 last:pb-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-card-foreground">{r.name ?? "(no name given)"}</span>
                  <span className="text-sm text-muted-foreground">{r.email}</span>
                  <Badge tone="amber">Asked to be a teacher</Badge>
                  <span className="ml-auto text-xs text-muted-foreground">{fmtDateTime(r.createdAt)}</span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  They have student access until you approve this.
                </p>
                <RequestActions requestId={r.id} />
              </li>
            ))}
          </ul>
        )}
      </Card>

      <h2 className="mb-3 font-heading text-lg font-semibold">People</h2>
      <Card className="mb-8 overflow-x-auto rounded-xl border-brand-100">
        <table className="w-full min-w-[46rem] text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
              <th className="pb-2 pr-3 font-medium">Person</th>
              <th className="pb-2 pr-3 font-medium">Role</th>
              <th className="pb-2 pr-3 font-medium">Joined</th>
              <th className="pb-2 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {accounts.map((a) => (
              <tr key={a.id} className="align-top">
                <td className="py-3 pr-3">
                  <div className="flex items-center gap-2.5">
                    <Avatar name={a.name} url={a.avatarUrl} seed={a.id} size={36} />
                    <span className="min-w-0">
                      <span className="block font-medium text-card-foreground">
                        {a.name ?? "(no name)"}
                        {a.id === user.id ? (
                          <span className="ml-1 text-xs font-normal text-muted-foreground">(you)</span>
                        ) : null}
                      </span>
                      <span className="block text-xs text-muted-foreground">{a.email}</span>
                    </span>
                  </div>
                </td>
                <td className="py-3 pr-3">
                  <Badge tone={ROLE_TONE[a.role] ?? "gray"}>{a.role.replace("_", " ")}</Badge>
                  {a.suspended ? (
                    <Badge tone="red" className="ml-1">
                      Suspended
                    </Badge>
                  ) : null}
                </td>
                <td className="py-3 pr-3 text-xs text-muted-foreground">{fmtDateTime(a.createdAt)}</td>
                <td className="py-3">
                  <AccountActions
                    userId={a.id}
                    email={a.email}
                    role={a.role}
                    suspended={a.suspended}
                    canManage={a.id !== user.id && (isSuper || a.role !== "super_admin")}
                    canMakeAdmin={isSuper}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-3 text-xs text-muted-foreground">
          Changing a role and suspending sign-in are both reversible. Deleting is not — it removes
          the account and its own history, though questions they wrote stay in the bank.
          {isSuper ? "" : " Only a super admin can create admins or change another super admin."}
        </p>
      </Card>

      <h2 className="mb-3 font-heading text-lg font-semibold">Users</h2>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <StatCard label="Total users" value={totalUsers.toLocaleString()} icon={<UsersIcon />} iconTone="blue" />
        <StatCard label="Students" value={students.toLocaleString()} icon={<GradCapIcon />} iconTone="blue" />
        <StatCard label="Teachers" value={teachers.toLocaleString()} icon={<UsersIcon />} iconTone="purple" />
        <StatCard label="Admins" value={admins.toLocaleString()} icon={<ShieldIcon />} iconTone="amber" />
        <StatCard label="Super admins" value={superAdmins.toLocaleString()} icon={<CrownIcon />} iconTone="red" />
      </div>

      <h2 className="mt-8 mb-3 font-heading text-lg font-semibold">Content</h2>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5">
        <StatCard
          label="Questions"
          value={totalQuestions.toLocaleString()}
          hint={`${activeQuestions.toLocaleString()} active · ${inactiveQuestions.toLocaleString()} inactive`}
          icon={<HelpCircleIcon />}
          iconTone="purple"
        />
        <StatCard
          label="AI review pending"
          value={aiPending.toLocaleString()}
          hint="AI-generated, awaiting teacher review"
          icon={<SparklesIcon />}
          iconTone="amber"
        />
        <StatCard
          label="Mock exam sets"
          value={examSets.toLocaleString()}
          hint={`${examSessions.toLocaleString()} sessions taken`}
          icon={<ClipboardIcon />}
          iconTone="green"
        />
        <StatCard label="Flashcards" value={flashcards.toLocaleString()} icon={<LayersIcon />} iconTone="blue" />
        <StatCard label="Case studies" value={caseStudies.toLocaleString()} icon={<FileTextIcon />} iconTone="purple" />
      </div>

      <div className="mt-8 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardTitle>Recent signups</CardTitle>
          {recentProfiles && recentProfiles.length > 0 ? (
            <div className="mt-4 overflow-hidden rounded-lg border border-border">
              <div className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-3 bg-muted px-4 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <span>Name</span>
                <span>Role</span>
                <span>Tier</span>
                <span className="text-right">Joined</span>
              </div>
              <ul className="divide-y divide-border">
                {recentProfiles.map((p, i) => (
                  <li
                    key={p.id}
                    className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-3 px-4 py-2.5"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <span
                        className={cn(
                          "flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-xs font-bold",
                          AVATAR_TONE[i % AVATAR_TONE.length]
                        )}
                      >
                        {initials(p.full_name)}
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-card-foreground">
                          {p.full_name ?? "Unnamed user"}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">
                          {p.full_name ? p.id.slice(0, 8) : "No name set"}
                        </p>
                      </div>
                    </div>
                    <Badge tone={ROLE_TONE[p.role] ?? "gray"}>{p.role}</Badge>
                    <Badge tone={p.subscription_tier === "free" ? "gray" : "green"}>
                      {p.subscription_tier}
                    </Badge>
                    <span className="text-right text-xs text-muted-foreground">
                      {new Date(p.created_at).toLocaleDateString("en", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
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

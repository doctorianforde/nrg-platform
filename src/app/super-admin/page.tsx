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

const HelpCircleIcon = () => (
  <Icon>
    <circle cx="12" cy="12" r="10" />
    <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
    <line x1="12" y1="17" x2="12.01" y2="17" />
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

const GlobeIcon = () => (
  <Icon>
    <circle cx="12" cy="12" r="10" />
    <line x1="2" y1="12" x2="22" y2="12" />
    <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
  </Icon>
);

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
    <DashboardShell
      profile={profile}
      email={user.email}
      title="Super admin"
      eyebrow="Platform Administration"
      subtitle="Cross-platform overview and environment references. Read-only."
    >
      <h2 className="mb-3 font-heading text-lg font-semibold">Platform overview</h2>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        <StatCard label="Users" value={totalUsers.toLocaleString()} icon={<UsersIcon />} iconTone="blue" />
        <StatCard
          label="Questions"
          value={totalQuestions.toLocaleString()}
          hint={`${aiPending.toLocaleString()} AI-generated awaiting review`}
          icon={<HelpCircleIcon />}
          iconTone="purple"
        />
        <StatCard
          label="Mock exam sets"
          value={examSets.toLocaleString()}
          hint={`${examSessions.toLocaleString()} sessions taken`}
          icon={<ClipboardIcon />}
          iconTone="green"
        />
        <StatCard
          label="Content items"
          value={(caseStudies + flashcards).toLocaleString()}
          hint={`${caseStudies.toLocaleString()} case studies · ${flashcards.toLocaleString()} flashcards`}
          icon={<LayersIcon />}
          iconTone="purple"
        />
        <StatCard
          label="Domains"
          value={domains.toLocaleString()}
          hint={`${topics.toLocaleString()} topics`}
          icon={<GlobeIcon />}
          iconTone="amber"
        />
      </div>

      <div className="mt-8 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardTitle>Environments</CardTitle>
          <dl className="mt-4 space-y-3 text-sm">
            <div className="flex items-center justify-between rounded-lg bg-muted px-4 py-3">
              <dt className="font-medium text-card-foreground">Production</dt>
              <dd className="font-mono text-xs text-muted-foreground">cdvubijjepwmhhkgppbl</dd>
            </div>
            <div className="flex items-center justify-between rounded-lg bg-muted px-4 py-3">
              <dt className="font-medium text-card-foreground">Staging</dt>
              <dd className="font-mono text-xs text-muted-foreground">kwhaqhhwqykckarjbdod</dd>
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

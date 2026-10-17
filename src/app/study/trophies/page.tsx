import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { DashboardShell } from "@/components/DashboardShell";
import { Card, CardTitle } from "@/components/ui/Card";
import { BadgeTile } from "@/components/badges/BadgeTile";
import { BadgeWall } from "@/components/badges/BadgeWall";
import { flags } from "@/lib/flags";
import { loadBadgeCatalogue, loadBadgeWall, loadEarned, type BadgeDef } from "@/lib/badges/queries";
import { setShowBadges } from "@/lib/badges/actions";
import { rankLevel } from "@/lib/badges/types";

export const dynamic = "force-dynamic";

const TIERS = [
  { key: "novice", name: "Novice", trophy: null },
  { key: "advanced-beginner", name: "Advanced Beginner", trophy: "trophy-advanced-beginner" },
  { key: "competent", name: "Competent Candidate", trophy: "trophy-competent" },
  { key: "proficient", name: "Proficient Candidate", trophy: "trophy-proficient" },
  { key: "expert", name: "Expert Candidate", trophy: "trophy-expert" },
] as const;

const AREAS: { category: string; title: string }[] = [
  { category: "streak", title: "Streaks" },
  { category: "mastery", title: "Mastery" },
  { category: "volume", title: "Questions answered" },
  { category: "mock", title: "Mock exams" },
  { category: "promotion", title: "Promotion quizzes" },
  { category: "case", title: "Case studies" },
  { category: "contribution", title: "Contributions" },
];

/** How to earn a badge that isn't earned yet. Tier trophies name the rank that earns them (e.g. "Reach Competent I"). */
const TROPHY_RANK: Record<string, string> = {
  "trophy-advanced-beginner": "Advanced Beginner I", "trophy-competent": "Competent I", "trophy-proficient": "Proficient I",
  "trophy-expert": "Expert I", "trophy-summit": "Expert V",
};
function hint(d: BadgeDef): string {
  if (d.is_secret) return "Secret";
  if (d.category === "rank") return "Pass its promotion quiz";
  if (d.category === "trophy") return `Reach ${TROPHY_RANK[d.code] ?? d.name}`;
  return d.description;
}

export default async function TrophiesPage() {
  if (!flags.rankingV2) notFound();
  const { user, profile } = await requireRole("student", "/study/trophies");
  const supabase = createClient();
  const [defs, earned, wall, { data: me }] = await Promise.all([
    loadBadgeCatalogue(supabase),
    loadEarned(supabase, user.id),
    loadBadgeWall(supabase),
    supabase.from("profiles").select("show_badges").eq("id", user.id).single(),
  ]);
  const byCode = new Map(defs.map((d) => [d.code, d]));
  const tile = (d: BadgeDef, size?: number) => (
    <BadgeTile key={d.code} code={d.code} art={d.art} name={d.is_secret && !earned.has(d.code) ? "???" : d.name}
      hint={hint(d)} earnedAt={earned.get(d.code)} size={size} />
  );
  const ranks = defs.filter((d) => d.category === "rank");
  const showing = me?.show_badges ?? true;
  const pct = Math.round((100 * earned.size) / Math.max(1, defs.length));

  return (
    <DashboardShell protect={false} profile={profile} email={user.email} title="Trophies" eyebrow="Rank"
      subtitle="Every badge you can earn. Earned ones are in colour; the rest show how to get them.">
      <div className="grid gap-5 lg:grid-cols-[1fr_20rem]">
        <div className="space-y-5">
          <Card className="rounded-xl border-brand-100">
            <CardTitle>Rank ladder</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">One badge for every promotion quiz you pass, and a trophy each time you reach a new tier.</p>
            <div className="mt-4 space-y-5">
              {TIERS.map((t) => {
                const row = ranks.filter((d) => d.tier === t.key).sort((a, b) => rankLevel(a.code)! - rankLevel(b.code)!);
                const trophy = t.trophy ? byCode.get(t.trophy) : null;
                const summit = t.key === "expert" ? byCode.get("trophy-summit") : null;
                return (
                  <section key={t.key}>
                    <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t.name}</h3>
                    <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-7">
                      {trophy ? tile(trophy) : null}
                      {row.map((d) => tile(d))}
                      {summit ? tile(summit) : null}
                    </div>
                  </section>
                );
              })}
            </div>
          </Card>

          <Card className="rounded-xl border-brand-100">
            <CardTitle>Accomplishments</CardTitle>
            <div className="mt-4 space-y-5">
              {AREAS.map((a) => {
                const list = defs.filter((d) => d.category === a.category);
                if (!list.length) return null;
                return (
                  <section key={a.category}>
                    <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{a.title}</h3>
                    <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5">{list.map((d) => tile(d))}</div>
                  </section>
                );
              })}
            </div>
          </Card>
        </div>

        <div className="space-y-5">
          <Card className="rounded-xl border-brand-100">
            <CardTitle>Your collection</CardTitle>
            <p className="mt-2 font-heading text-3xl font-bold text-brand-700">{earned.size} <span className="text-base font-medium text-muted-foreground">of {defs.length}</span></p>
            <div className="mt-2 h-2 w-full overflow-hidden rounded bg-muted" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
              <div className="h-full bg-brand-600" style={{ width: `${pct}%` }} />
            </div>
            <form action={setShowBadges} className="mt-4 border-t border-border pt-3">
              <input type="hidden" name="show" value={showing ? "0" : "1"} />
              <p className="text-sm font-medium text-card-foreground">Show my badges to classmates</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {showing ? "On: classmates can see your badges and the ones you earn this week. Teachers always can." : "Off: only you and your teachers can see your badges."}
              </p>
              <button className={`mt-2 rounded-lg border px-3 py-1.5 text-sm font-medium ${showing ? "border-border hover:bg-muted" : "border-brand-300 bg-brand-50 text-brand-800 hover:bg-brand-100"}`}>
                {showing ? "Turn off" : "Turn on"}
              </button>
            </form>
          </Card>

          <Card className="rounded-xl border-brand-100">
            <CardTitle>Recent achievements</CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">Badges classmates earned this week.</p>
            <BadgeWall entries={wall.filter((e) => e.userId !== user.id)} meId={user.id} />
          </Card>
        </div>
      </div>
    </DashboardShell>
  );
}

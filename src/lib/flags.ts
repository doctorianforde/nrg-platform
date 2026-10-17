/**
 * Feature flags read from the environment at build time.
 *
 * rankingV2: the weighted-XP, streak and promotion-quiz system (Ian's ranking build plan, 2026-10-10). Its database
 * objects exist on staging only until the prod migrations are applied, so it must stay off on the prod Vercel project.
 * Set NEXT_PUBLIC_RANKING_V2=1 on the staging project only.
 *
 * contentProtection: watermark plus copy/print/screenshot deterrents on question content, for students only
 * (src/components/ContentProtection.tsx, wired in DashboardShell). ON by default; set NEXT_PUBLIC_CONTENT_PROTECTION=0
 * (or "off" / "false") on a Vercel project and redeploy to turn it off there.
 */
export const flags = {
  rankingV2: process.env.NEXT_PUBLIC_RANKING_V2 === "1",
  contentProtection: !["0", "off", "false"].includes((process.env.NEXT_PUBLIC_CONTENT_PROTECTION ?? "").toLowerCase()),
} as const;

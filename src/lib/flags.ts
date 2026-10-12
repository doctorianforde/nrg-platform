/**
 * Feature flags read from the environment at build time.
 *
 * rankingV2: the weighted-XP, streak and promotion-quiz system (Ian's ranking build plan, 2026-10-10). Its database
 * objects exist on staging only until the prod migrations are applied, so it must stay off on the prod Vercel project.
 * Set NEXT_PUBLIC_RANKING_V2=1 on the staging project only.
 */
export const flags = {
  rankingV2: process.env.NEXT_PUBLIC_RANKING_V2 === "1",
} as const;

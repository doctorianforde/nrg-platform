"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { BadgeArt } from "@/components/badges/BadgeArt";
import { Confetti } from "@/components/badges/Confetti";
import { fetchUnseenBadges, markBadgesSeen } from "@/lib/badges/actions";
import { rankLevel, tierOfLevel, WEIGHT_ORDER, type EarnedBadge } from "@/lib/badges/types";

/** Other components dispatch this after a client-side flow that may have earned badges (e.g. finishing practice). */
export const BADGES_CHECK_EVENT = "nrg:badges-check";

const TIER_NAME: Record<string, string> = {
  novice: "Novice", "advanced-beginner": "Advanced Beginner", competent: "Competent Candidate",
  proficient: "Proficient Candidate", expert: "Expert Candidate",
};

const sortQueue = (list: EarnedBadge[]) =>
  [...list].sort((a, b) => WEIGHT_ORDER[a.weight] - WEIGHT_ORDER[b.weight] || a.earnedAt.localeCompare(b.earnedAt));

/**
 * Plays each newly earned badge once: a full ceremony for a promotion (and its tier trophy), a reveal card for a major
 * accomplishment, a corner toast for a smaller one. `initial` comes from the server on every page render; client-only
 * flows trigger a re-check with the BADGES_CHECK_EVENT. Each badge is marked seen when its celebration is dismissed
 * (toasts as soon as they appear).
 */
export function BadgeCelebrations({ initial }: { initial: EarnedBadge[] }) {
  const [queue, setQueue] = useState<EarnedBadge[]>([]);
  const queued = useRef(new Set<string>());

  const enqueue = useCallback((list: EarnedBadge[]) => {
    const fresh = list.filter((b) => !queued.current.has(b.code));
    fresh.forEach((b) => queued.current.add(b.code));
    if (fresh.length) setQueue((q) => sortQueue([...q, ...fresh]));
  }, []);

  useEffect(() => enqueue(initial), [initial, enqueue]);
  useEffect(() => {
    const check = () => { void fetchUnseenBadges().then(enqueue); };
    window.addEventListener(BADGES_CHECK_EVENT, check);
    return () => window.removeEventListener(BADGES_CHECK_EVENT, check);
  }, [enqueue]);

  const dismiss = useCallback((codes: string[]) => {
    setQueue((q) => q.filter((b) => !codes.includes(b.code)));
    void markBadgesSeen(codes);
  }, []);

  const ceremony = queue.filter((b) => b.weight === "ceremony");
  const majors = queue.filter((b) => b.weight === "major");
  const toasts = queue.filter((b) => b.weight === "toast");

  if (ceremony.length) return <RankCeremony badges={ceremony} onDone={() => dismiss(ceremony.map((b) => b.code))} />;
  if (majors.length) return <RevealCard key={majors[0].code} badge={majors[0]} more={majors.length - 1} onDone={() => dismiss([majors[0].code])} />;
  return <Toasts badges={toasts} onShown={(codes) => void markBadgesSeen(codes)} onGone={(code) => setQueue((q) => q.filter((b) => b.code !== code))} />;
}

function useDismissKeys(onDone: () => void) {
  const button = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    button.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onDone(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onDone]);
  return button;
}

/** Promotion: the previous rank's medal flips over to the new one; a tier trophy rises beside it; confetti. */
function RankCeremony({ badges, onDone }: { badges: EarnedBadge[]; onDone: () => void }) {
  const button = useDismissKeys(onDone);
  const rank = badges.filter((b) => rankLevel(b.code) !== null).sort((a, b) => rankLevel(b.code)! - rankLevel(a.code)!)[0];
  const trophy = badges.find((b) => b.category === "trophy");
  const level = rank ? rankLevel(rank.code)! : null;
  const summit = trophy?.code === "trophy-summit";
  return (
    <div role="dialog" aria-modal="true" aria-labelledby="ceremony-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-brand-midnight/80 p-4 backdrop-blur-sm motion-safe:animate-fade-in motion-reduce:animate-fade-in">
      <Confetti pieces={summit ? 260 : trophy ? 200 : 140} durationMs={summit ? 3600 : 2600} />
      <div className="relative w-full max-w-md overflow-hidden rounded-2xl bg-gradient-to-b from-header-from to-brand-midnight px-6 pb-6 pt-7 text-center text-white shadow-2xl ring-1 ring-white/10">
        <div aria-hidden="true" className="pointer-events-none absolute -top-24 left-1/2 h-64 w-64 -translate-x-1/2 rounded-full bg-[#F2B705]/25 blur-3xl" />
        <p className="relative text-xs font-semibold uppercase tracking-[0.2em] text-[#F2D27A]">{summit ? "Top of the ladder" : trophy ? "New tier reached" : "Promotion"}</p>
        <div className="relative mt-4 flex items-end justify-center gap-4">
          {rank && level !== null ? (
            <div className="[perspective:900px]" style={{ width: 168, height: 168 }}>
              <div className="relative h-full w-full [transform-style:preserve-3d] motion-safe:animate-badge-flip motion-reduce:[transform:rotateY(180deg)]">
                <div className="absolute inset-0 [backface-visibility:hidden]">
                  <BadgeArt code={`rank-${level - 1}`} art={`rank-${tierOfLevel(level - 1)}`} size={168} />
                </div>
                <div className="absolute inset-0 [backface-visibility:hidden] [transform:rotateY(180deg)]">
                  <BadgeArt code={rank.code} art={rank.art} size={168} />
                </div>
              </div>
            </div>
          ) : null}
          {trophy ? (
            <div className="motion-safe:animate-trophy-rise motion-reduce:animate-fade-in">
              <BadgeArt code={trophy.code} art={trophy.art} size={summit ? 150 : 128} />
            </div>
          ) : null}
        </div>
        <h2 id="ceremony-title" className="relative mt-4 font-heading text-2xl font-bold motion-safe:animate-rise-in" style={{ animationDelay: "1.3s" }}>
          {rank ? <>You are now <span className="whitespace-nowrap">{rank.name}</span></> : trophy?.name}
        </h2>
        <p className="relative mt-1 text-sm text-white/75 motion-safe:animate-rise-in" style={{ animationDelay: "1.5s" }}>
          {summit ? "The top of the ladder. A safe, thinking nurse, ready for registration."
            : trophy ? `Welcome to the ${TIER_NAME[trophy.tier ?? ""] ?? trophy.name} tier. Your trophy is in your trophy case.`
            : level !== null ? `${TIER_NAME[tierOfLevel(level)]} tier · level ${level + 1} of 25` : ""}
        </p>
        <button ref={button} type="button" onClick={onDone}
          className="relative mt-6 rounded-lg bg-[#F2B705] px-6 py-2.5 text-sm font-semibold text-brand-midnight hover:bg-[#FFD84D] focus:outline-none focus-visible:ring-2 focus-visible:ring-white">
          Continue
        </button>
      </div>
    </div>
  );
}

/** A major accomplishment: the badge pops in with a shine across it. */
function RevealCard({ badge, more, onDone }: { badge: EarnedBadge; more: number; onDone: () => void }) {
  const button = useDismissKeys(onDone);
  return (
    <div role="dialog" aria-modal="true" aria-labelledby="reveal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-brand-midnight/70 p-4 backdrop-blur-sm motion-safe:animate-fade-in motion-reduce:animate-fade-in">
      <div className="w-full max-w-sm rounded-2xl bg-card px-6 pb-6 pt-6 text-center shadow-2xl motion-safe:animate-bounce-in motion-reduce:animate-fade-in">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-brand-700">Badge earned</p>
        <div className="relative mx-auto mt-3 w-fit overflow-hidden rounded-full motion-safe:animate-badge-pop motion-reduce:animate-fade-in">
          <BadgeArt code={badge.code} art={badge.art} size={150} />
          <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 left-0 w-1/3 bg-gradient-to-r from-transparent via-white/70 to-transparent motion-safe:animate-shine motion-reduce:hidden" />
        </div>
        <h2 id="reveal-title" className="mt-3 font-heading text-xl font-bold text-card-foreground">{badge.name}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{badge.description}</p>
        <button ref={button} type="button" onClick={onDone}
          className="mt-5 rounded-lg bg-primary px-6 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary-hover">
          {more > 0 ? `Next (${more} more)` : "Nice!"}
        </button>
      </div>
    </div>
  );
}

/** Smaller badges: up to three toasts in the corner, each for a few seconds. */
function Toasts({ badges, onShown, onGone }: { badges: EarnedBadge[]; onShown: (codes: string[]) => void; onGone: (code: string) => void }) {
  const visible = badges.slice(0, 3);
  const announced = useRef(new Set<string>());
  useEffect(() => {
    const fresh = visible.map((b) => b.code).filter((c) => !announced.current.has(c));
    if (!fresh.length) return;
    fresh.forEach((c) => announced.current.add(c));
    onShown(fresh);
    const timers = fresh.map((c) => setTimeout(() => onGone(c), 5000));
    return () => timers.forEach(clearTimeout);
  });
  if (!visible.length) return null;
  return (
    <div aria-live="polite" className="pointer-events-none fixed bottom-4 right-4 z-50 flex w-[min(22rem,calc(100vw-2rem))] flex-col gap-2">
      {visible.map((b) => (
        <div key={b.code} className="pointer-events-auto flex items-center gap-3 rounded-xl border border-brand-100 bg-card p-3 shadow-lg motion-safe:animate-toast-in motion-reduce:animate-fade-in">
          <BadgeArt code={b.code} art={b.art} size={52} />
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-brand-700">Badge earned</p>
            <p className="truncate text-sm font-semibold text-card-foreground">{b.name}</p>
            <p className="truncate text-xs text-muted-foreground">{b.description}</p>
          </div>
          <button type="button" onClick={() => onGone(b.code)} aria-label={`Dismiss ${b.name}`}
            className="rounded px-1.5 text-lg leading-none text-muted-foreground hover:bg-muted">×</button>
        </div>
      ))}
    </div>
  );
}

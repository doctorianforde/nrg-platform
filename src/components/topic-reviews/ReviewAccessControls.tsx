"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useFormState, useFormStatus } from "react-dom";
import { completeTopicReview, openTopicReview, type CompleteReviewResult, type OpenReviewState } from "@/lib/topic-reviews/actions";

const mmss = (s: number) => `${Math.floor(Math.max(0, s) / 60)}:${String(Math.max(0, s) % 60).padStart(2, "0")}`;

function StartButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm transition-all hover:bg-primary-hover hover:shadow-md disabled:opacity-60"
    >
      {pending ? "Opening…" : "Start my free review"}
    </button>
  );
}

/** Free tier: spend today's review on this one. The database records it and starts the timer. */
export function StartFreeReview({ slug, minutes }: { slug: string; minutes: number }) {
  const [state, action] = useFormState<OpenReviewState, FormData>(openTopicReview, null);
  return (
    <form action={action} className="mt-4">
      <input type="hidden" name="slug" value={slug} />
      <StartButton />
      <p className="mt-2 text-xs text-muted-foreground">You&apos;ll have {minutes} minutes with it, starting when you press the button.</p>
      {state?.error ? <p role="alert" className="mt-2 text-sm text-red-700">{state.error}</p> : null}
    </form>
  );
}

/** Free tier: time left with this review. At zero the page reloads, and the server shows the upgrade notice instead. */
export function FreeReviewTimer({ expiresAt }: { expiresAt: string }) {
  const router = useRouter();
  const end = Date.parse(expiresAt);
  const [left, setLeft] = useState(() => Math.ceil((end - Date.now()) / 1000));
  useEffect(() => {
    const t = setInterval(() => {
      const s = Math.ceil((end - Date.now()) / 1000);
      setLeft(s);
      if (s <= 0) {
        clearInterval(t);
        router.refresh();
      }
    }, 1000);
    return () => clearInterval(t);
  }, [end, router]);
  return (
    <div className="sticky top-16 z-10 -mx-1 mb-4 flex items-center gap-3 rounded-xl border border-brand-200 bg-card/95 px-4 py-2 text-sm shadow-sm backdrop-blur">
      <span className="font-mono text-base font-semibold tabular-nums text-brand-700">{mmss(left)}</span>
      <span className="text-muted-foreground">left with your free review today. Upgrade for unlimited reading.</span>
    </div>
  );
}

/**
 * At the end of a review: once the student has scrolled here and spent the minimum time with it, the read is recorded
 * and the XP paid (the database checks the time; this only decides when to ask).
 */
export function ReadTracker({
  slug,
  openedAt,
  minSeconds,
  xp,
  xpLive,
  alreadyRead,
}: {
  slug: string;
  openedAt: string | null;
  minSeconds: number;
  xp: number;
  xpLive: boolean;
  alreadyRead: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [reached, setReached] = useState(false);
  const [result, setResult] = useState<CompleteReviewResult | null>(alreadyRead ? { status: "already" } : null);
  const [now, setNow] = useState(() => Date.now());
  const asked = useRef(false);
  const unlockAt = openedAt ? Date.parse(openedAt) + minSeconds * 1000 : null;

  useEffect(() => {
    const el = ref.current;
    if (!el || result) return;
    const io = new IntersectionObserver((es) => es.some((e) => e.isIntersecting) && setReached(true), { threshold: 0.5 });
    io.observe(el);
    return () => io.disconnect();
  }, [result]);

  useEffect(() => {
    if (result || !reached) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [reached, result]);

  useEffect(() => {
    if (result || !reached || asked.current || !unlockAt || now < unlockAt) return;
    asked.current = true;
    void completeTopicReview(slug).then((r) => {
      if (r.status === "early") {
        asked.current = false;
        setNow(Date.now());
        return;
      }
      setResult(r);
      if (r.status === "read") window.dispatchEvent(new Event("nrg:badges-check"));
    });
  }, [now, reached, result, slug, unlockAt]);

  const reward = xpLive ? `${xp} XP` : "credit for reading it";
  let text: React.ReactNode;
  if (result?.status === "read") text = <><strong className="text-green-700">{result.xp > 0 ? `+${result.xp} XP` : "Marked as read"}</strong> — review complete.</>;
  else if (result?.status === "already") text = <><strong className="text-green-700">✓ Read.</strong> You&apos;ve finished this review before.</>;
  else if (result) text = "Couldn't record this read. Reload the page to try again.";
  else if (!reached) text = <>Read to the end to earn <strong>{reward}</strong>.</>;
  else if (unlockAt && now < unlockAt) text = <>You reached the end. <strong>{reward}</strong> unlocks after {Math.round(minSeconds / 60)} minutes with the review: {mmss(Math.ceil((unlockAt - now) / 1000))} to go.</>;
  else text = "Recording your read…";

  return (
    <div ref={ref} className="mt-8 flex items-center gap-3 rounded-xl border border-brand-200 bg-brand-50 px-4 py-3 text-sm text-card-foreground">
      <span aria-hidden className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-brand-400 to-brand-700 text-xs font-bold text-white">
        XP
      </span>
      <p aria-live="polite">{text}</p>
    </div>
  );
}

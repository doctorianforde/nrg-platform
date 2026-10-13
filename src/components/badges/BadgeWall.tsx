"use client";

import { useEffect, useRef, useState } from "react";
import { BadgeArt } from "@/components/badges/BadgeArt";
import { fetchClassmateBadges } from "@/lib/badges/actions";
import type { WallEntry, MiniBadge } from "@/lib/badges/queries";

const ago = (iso: string) => {
  const m = Math.round((Date.now() - Date.parse(iso)) / 60000);
  if (m < 60) return `${Math.max(1, m)} min ago`;
  const h = Math.round(m / 60); if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24); return `${d} day${d === 1 ? "" : "s"} ago`;
};

/** Classmates' recent badges. Clicking a name opens that classmate's trophy card. */
export function BadgeWall({ entries, meId }: { entries: WallEntry[]; meId: string }) {
  const [open, setOpen] = useState<{ id: string; name: string } | null>(null);
  if (!entries.length) return <p className="mt-2 text-sm text-muted-foreground">No badges earned this week yet. Yours could be first.</p>;
  return (
    <>
      <ul className="mt-3 space-y-2">
        {entries.map((e) => (
          <li key={`${e.userId}-${e.badge.code}`} className="flex items-center gap-2.5">
            <BadgeArt code={e.badge.code} art={e.badge.art} size={36} />
            <p className="min-w-0 flex-1 text-sm leading-tight">
              {e.userId === meId ? <span className="font-semibold">You</span> : (
                <button type="button" onClick={() => setOpen({ id: e.userId, name: e.name })} className="font-semibold text-brand-700 hover:underline">{e.name}</button>
              )}{" "}
              earned <span className="font-medium">{e.badge.name}</span>
              <span className="block text-xs text-muted-foreground">{ago(e.earnedAt)}</span>
            </p>
          </li>
        ))}
      </ul>
      {open ? <ClassmateCard id={open.id} fallbackName={open.name} onClose={() => setOpen(null)} /> : null}
    </>
  );
}

function ClassmateCard({ id, fallbackName, onClose }: { id: string; fallbackName: string; onClose: () => void }) {
  const [data, setData] = useState<{ name: string | null; badges: (MiniBadge & { earnedAt: string })[] } | null>(null);
  const button = useRef<HTMLButtonElement>(null);
  useEffect(() => { void fetchClassmateBadges(id).then(setData); }, [id]);
  useEffect(() => {
    button.current?.focus();
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k);
  }, [onClose]);
  return (
    <div role="dialog" aria-modal="true" aria-labelledby="classmate-title" onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 motion-safe:animate-fade-in">
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl motion-safe:animate-bounce-in">
        <div className="flex items-center justify-between gap-2">
          <h2 id="classmate-title" className="font-heading text-lg font-bold text-card-foreground">{data?.name ?? fallbackName}&apos;s trophies</h2>
          <button ref={button} type="button" onClick={onClose} aria-label="Close" className="rounded px-2 text-xl leading-none text-muted-foreground hover:bg-muted">×</button>
        </div>
        {!data ? <p className="mt-4 text-sm text-muted-foreground">Loading…</p>
          : data.badges.length === 0 ? <p className="mt-4 text-sm text-muted-foreground">Nothing to show.</p>
          : (
            <div className="mt-4 grid grid-cols-4 gap-2 sm:grid-cols-5">
              {data.badges.map((b) => (
                <div key={b.code} className="flex flex-col items-center text-center" title={b.name}>
                  <BadgeArt code={b.code} art={b.art} size={52} />
                  <span className="mt-1 text-[10px] leading-tight text-muted-foreground">{b.name}</span>
                </div>
              ))}
            </div>
          )}
      </div>
    </div>
  );
}

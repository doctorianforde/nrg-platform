"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { cn } from "@/lib/cn";
import { Badge } from "@/components/ui/Badge";

export type LibraryRecording = {
  slug: string;
  title: string;
  kind: "lecture" | "session" | "short";
  kindLabel: string;
  presenter: string | null;
  description: string | null;
  durationSeconds: number;
  length: string;
  thumbnailUrl: string | null;
  freeSample: boolean;
  draft: boolean;
  publishedAt: string | null;
  domain: { code: string; name: string } | null;
  reviews: { slug: string; title: string }[];
  progressPct: number | null;
  watched: boolean;
  playable: boolean;
  /** Tagged to one of the student's weakest topics (My progress). */
  focus: boolean;
};

type Sort = "focus" | "newest" | "az" | "shortest";
const LENGTHS: Array<[string, string, (s: number) => boolean]> = [
  ["short", "Under 10 min", (s) => s < 600],
  ["mid", "10 to 30 min", (s) => s >= 600 && s <= 1800],
  ["long", "Over 30 min", (s) => s > 1800],
];

/** The recordings library: a filter panel beside the results, like the topic review library (2026-11-09). */
export function RecordingsLibrary({ items, staff }: { items: LibraryRecording[]; staff: boolean }) {
  const hasFocus = items.some((i) => i.focus);
  const [q, setQ] = useState("");
  const [kinds, setKinds] = useState<string[]>([]);
  const [domains, setDomains] = useState<string[]>([]);
  const [lengths, setLengths] = useState<string[]>([]);
  const [show, setShow] = useState<"all" | "unwatched" | "watched" | "free">("all");
  const [sort, setSort] = useState<Sort>(hasFocus ? "focus" : "newest");
  const [view, setView] = useState<"cards" | "list">("cards");

  const kindOptions = useMemo(() => count(items.map((i) => i.kindLabel)), [items]);
  const domainOptions = useMemo(() => count(items.filter((i) => i.domain).map((i) => i.domain!.name)), [items]);
  const toggle = (set: (f: (x: string[]) => string[]) => void, v: string) => set((cur) => (cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v]));

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const list = items.filter((i) => {
      if (kinds.length && !kinds.includes(i.kindLabel)) return false;
      if (domains.length && !(i.domain && domains.includes(i.domain.name))) return false;
      if (lengths.length && !LENGTHS.some(([k, , fit]) => lengths.includes(k) && fit(i.durationSeconds))) return false;
      if (show === "watched" && !i.watched) return false;
      if (show === "unwatched" && i.watched) return false;
      if (show === "free" && !i.freeSample) return false;
      if (!needle) return true;
      return [i.title, i.presenter ?? "", i.description ?? "", i.domain?.name ?? "", ...i.reviews.map((r) => r.title)].some((s) => s.toLowerCase().includes(needle));
    });
    const newest = (a: LibraryRecording, b: LibraryRecording) => (b.publishedAt ?? "").localeCompare(a.publishedAt ?? "");
    return list.sort(
      sort === "az" ? (a, b) => a.title.localeCompare(b.title)
      : sort === "shortest" ? (a, b) => a.durationSeconds - b.durationSeconds
      : sort === "focus" ? (a, b) => Number(b.focus) - Number(a.focus) || newest(a, b)
      : newest
    );
  }, [items, q, kinds, domains, lengths, show, sort]);

  const continuing = items.filter((i) => i.playable && !i.watched && (i.progressPct ?? 0) > 0);
  const active = q !== "" || kinds.length > 0 || domains.length > 0 || lengths.length > 0 || show !== "all";
  const clear = () => { setQ(""); setKinds([]); setDomains([]); setLengths([]); setShow("all"); };

  const panel = (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="font-heading text-sm font-semibold text-card-foreground">Filters</p>
        <button type="button" onClick={clear} disabled={!active} className="rounded-md border border-border px-2 py-1 text-xs font-medium text-muted-foreground transition-colors enabled:hover:bg-muted disabled:opacity-40">Clear all</button>
      </div>
      <label className="block">
        <span className="sr-only">Search recordings</span>
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search, e.g. acidosis"
          className="w-full rounded-lg border border-input bg-card px-3 py-2 text-sm text-card-foreground placeholder:text-muted-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
      </label>
      <Group title="Show">
        {([["all", "All"], ["unwatched", "Not watched yet"], ["watched", "Watched"], ["free", "Free samples"]] as const).map(([v, l]) => (
          <Choice key={v} type="radio" name="rec-show" checked={show === v} onChange={() => setShow(v)} label={l} />
        ))}
      </Group>
      <Group title="Sort">
        {hasFocus ? <Choice type="radio" name="rec-sort" checked={sort === "focus"} onChange={() => setSort("focus")} label="For my weak areas" /> : null}
        <Choice type="radio" name="rec-sort" checked={sort === "newest"} onChange={() => setSort("newest")} label="Newest" />
        <Choice type="radio" name="rec-sort" checked={sort === "az"} onChange={() => setSort("az")} label="A–Z" />
        <Choice type="radio" name="rec-sort" checked={sort === "shortest"} onChange={() => setSort("shortest")} label="Shortest" />
      </Group>
      <Group title="Type" count={kinds.length}>
        {kindOptions.map(([k, n]) => <Choice key={k} type="checkbox" name="rec-kind" checked={kinds.includes(k)} onChange={() => toggle(setKinds, k)} label={k} count={n} />)}
      </Group>
      <Group title="Domain" count={domains.length}>
        {domainOptions.map(([d, n]) => <Choice key={d} type="checkbox" name="rec-domain" checked={domains.includes(d)} onChange={() => toggle(setDomains, d)} label={d} count={n} />)}
      </Group>
      <Group title="Length" count={lengths.length}>
        {LENGTHS.map(([k, l]) => <Choice key={k} type="checkbox" name="rec-length" checked={lengths.includes(k)} onChange={() => toggle(setLengths, k)} label={l} />)}
      </Group>
    </div>
  );

  return (
    <div className="space-y-8">
      {continuing.length ? (
        <section aria-label="Continue watching">
          <h2 className="mb-3 font-heading text-lg font-semibold text-foreground">Continue watching</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">{continuing.slice(0, 3).map((r) => <RecordingCard key={r.slug} r={r} staff={staff} />)}</div>
        </section>
      ) : null}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[15rem_minmax(0,1fr)]">
        <aside className="lg:sticky lg:top-24 lg:self-start">
          <details className="rounded-xl border border-border/80 bg-card p-4 shadow-sm lg:hidden">
            <summary className="cursor-pointer text-sm font-semibold text-card-foreground">Filters{active ? " (on)" : ""}</summary>
            <div className="mt-4">{panel}</div>
          </details>
          <div className="hidden rounded-xl border border-border/80 bg-card p-4 shadow-sm lg:block">{panel}</div>
        </aside>

        <section aria-label="Recordings">
          <div className="mb-4 flex items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground" aria-live="polite"><strong className="font-semibold text-foreground">{shown.length}</strong> {shown.length === 1 ? "recording" : "recordings"}</p>
            <div role="group" aria-label="Layout" className="flex rounded-lg border border-border bg-card p-0.5">
              {(["cards", "list"] as const).map((v) => (
                <button key={v} type="button" aria-pressed={view === v} onClick={() => setView(v)}
                  className={cn("rounded-md px-2.5 py-1 text-xs font-medium transition-colors", view === v ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground")}>
                  {v === "cards" ? "Cards" : "List"}
                </button>
              ))}
            </div>
          </div>
          {shown.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
              No recordings match these filters. <button type="button" onClick={clear} className="font-medium text-brand-700 underline">Clear all</button>
            </div>
          ) : view === "cards" ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">{shown.map((r) => <RecordingCard key={r.slug} r={r} staff={staff} />)}</div>
          ) : (
            <ul className="divide-y divide-border/70 overflow-hidden rounded-xl border border-border/80 bg-card shadow-sm">
              {shown.map((r) => (
                <li key={r.slug}>
                  <Link href={`/study/recordings/${r.slug}`} prefetch={false} className="group flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted">
                    <span className="w-12 shrink-0 text-right text-xs tabular-nums text-muted-foreground">{r.length}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium text-card-foreground group-hover:text-primary">{r.title}</span>
                      <span className="block truncate text-xs text-muted-foreground">{r.kindLabel}{r.domain ? ` · ${r.domain.name}` : ""}</span>
                    </span>
                    <Status r={r} staff={staff} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

function RecordingCard({ r, staff }: { r: LibraryRecording; staff: boolean }) {
  return (
    <Link href={`/study/recordings/${r.slug}`} prefetch={false} className="group flex flex-col overflow-hidden rounded-xl border border-border/80 bg-card shadow-sm transition-shadow hover:shadow-md">
      <div className="relative aspect-video w-full max-w-full bg-muted">
        {r.thumbnailUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={r.thumbnailUrl} alt="" className={cn("h-full w-full object-cover", !r.playable && "opacity-60 grayscale")} loading="lazy" />
        ) : null}
        <span className="absolute left-2 top-2 rounded-md bg-black/70 px-1.5 py-0.5 text-xs font-medium tabular-nums text-white">{r.length}</span>
        {!r.playable ? (
          <span className="absolute inset-0 flex items-center justify-center">
            <span className="rounded-full bg-black/70 px-3 py-1 text-xs font-semibold text-white">Paid plans</span>
          </span>
        ) : null}
        {r.progressPct ? <span className="absolute inset-x-0 bottom-0 h-1 bg-black/30"><span className="block h-full bg-primary" style={{ width: `${r.progressPct}%` }} /></span> : null}
      </div>
      <div className="flex flex-1 flex-col p-4">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="rounded-full bg-brand-100 px-2 py-0.5 text-[11px] font-semibold text-brand-800">{r.kindLabel}</span>
          {r.domain ? <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">{r.domain.code}</span> : null}
          <Status r={r} staff={staff} />
        </div>
        <h3 className="mt-2 font-heading text-base font-semibold text-card-foreground transition-colors group-hover:text-primary">{r.title}</h3>
        {r.presenter ? <p className="mt-auto pt-2 text-xs text-muted-foreground">{r.presenter}</p> : null}
      </div>
    </Link>
  );
}

function Status({ r, staff }: { r: LibraryRecording; staff: boolean }) {
  if (staff && r.draft) return <Badge tone="amber" dot>Draft</Badge>;
  if (r.watched) return <Badge tone="green" dot>Watched</Badge>;
  if (r.freeSample) return <Badge tone="blue" dot>Free sample</Badge>;
  if (r.focus) return <Badge tone="purple" dot>Focus area</Badge>;
  return null;
}

function count(values: string[]): Array<[string, number]> {
  const m = new Map<string, number>();
  for (const v of values) m.set(v, (m.get(v) ?? 0) + 1);
  return Array.from(m.entries()).sort((a, b) => a[0].localeCompare(b[0]));
}

function Group({ title, count: n, children }: { title: string; count?: number; children: React.ReactNode }) {
  return (
    <fieldset className="min-w-0 border-t border-border/70 pt-3">
      <legend className="flex items-center gap-1.5 pb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {title}{n ? <span className="rounded-full bg-brand-100 px-1.5 text-[10px] text-brand-800">{n}</span> : null}
      </legend>
      <div className="space-y-0.5">{children}</div>
    </fieldset>
  );
}

function Choice({ type, name, checked, onChange, label, count: n }: { type: "radio" | "checkbox"; name: string; checked: boolean; onChange: () => void; label: string; count?: number }) {
  return (
    <label className={cn("flex cursor-pointer items-start gap-2 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-muted", checked ? "bg-muted text-foreground" : "text-card-foreground")}>
      <input type={type} name={name} checked={checked} onChange={onChange} className="mt-1 h-3.5 w-3.5 shrink-0 accent-[hsl(var(--primary))]" />
      <span className="min-w-0 flex-1 break-words">{label}</span>
      {n !== undefined ? <span className="text-xs tabular-nums text-muted-foreground">{n}</span> : null}
    </label>
  );
}

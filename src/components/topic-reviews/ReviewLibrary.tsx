"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { cn } from "@/lib/cn";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";

export type LibraryItem = {
  slug: string;
  title: string;
  system: string;
  keywords: string[];
  status: "draft" | "published";
  read: boolean;
  sortOrder: number;
  /** One of the student's weakest topics points here (My progress). */
  focus: boolean;
};

type Sort = "focus" | "course" | "az";
type Show = "all" | "unread" | "read" | "draft" | "published";

/**
 * The topic-review library with a filter panel: search, body system, read state (students) or publish state (staff),
 * sort, and a card or list view. Filters live in one panel to the left of the results and scope all of them.
 */
export function ReviewLibrary({ items, staff }: { items: LibraryItem[]; staff: boolean }) {
  const hasFocus = items.some((i) => i.focus);
  const [q, setQ] = useState("");
  const [systems, setSystems] = useState<string[]>([]);
  const [show, setShow] = useState<Show>("all");
  const [sort, setSort] = useState<Sort>(hasFocus ? "focus" : "course");
  const [view, setView] = useState<"cards" | "list">("cards");

  const systemCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const i of items) m.set(i.system, (m.get(i.system) ?? 0) + 1);
    return Array.from(m.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [items]);

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const list = items.filter((i) => {
      if (systems.length && !systems.includes(i.system)) return false;
      if (show === "read" && !i.read) return false;
      if (show === "unread" && i.read) return false;
      if (show === "draft" && i.status !== "draft") return false;
      if (show === "published" && i.status !== "published") return false;
      if (!needle) return true;
      return [i.title, i.system, ...i.keywords].some((s) => s.toLowerCase().includes(needle));
    });
    const byCourse = (a: LibraryItem, b: LibraryItem) => a.sortOrder - b.sortOrder || a.title.localeCompare(b.title);
    return list.sort(
      sort === "az" ? (a, b) => a.title.localeCompare(b.title) : sort === "focus" ? (a, b) => Number(b.focus) - Number(a.focus) || byCourse(a, b) : byCourse
    );
  }, [items, q, systems, show, sort]);

  const active = q !== "" || systems.length > 0 || show !== "all";
  const clear = () => { setQ(""); setSystems([]); setShow("all"); };
  const shows: Array<[Show, string]> = staff
    ? [["all", "All"], ["published", "Published"], ["draft", "Drafts"]]
    : [["all", "All"], ["unread", "Not read yet"], ["read", "Read"]];

  const panel = (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="font-heading text-sm font-semibold text-card-foreground">Filters</p>
        <button type="button" onClick={clear} disabled={!active} className="rounded-md border border-border px-2 py-1 text-xs font-medium text-muted-foreground transition-colors enabled:hover:bg-muted disabled:opacity-40">
          Clear all
        </button>
      </div>
      <label className="block">
        <span className="sr-only">Search reviews</span>
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search topics, e.g. insulin"
          className="w-full rounded-lg border border-input bg-card px-3 py-2 text-sm text-card-foreground placeholder:text-muted-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </label>
      <Group title="Show">
        {shows.map(([v, label]) => (
          <Choice key={v} type="radio" name="show" checked={show === v} onChange={() => setShow(v)} label={label} />
        ))}
      </Group>
      <Group title="Sort">
        {hasFocus ? <Choice type="radio" name="sort" checked={sort === "focus"} onChange={() => setSort("focus")} label="Focus areas first" /> : null}
        <Choice type="radio" name="sort" checked={sort === "course"} onChange={() => setSort("course")} label="Course order" />
        <Choice type="radio" name="sort" checked={sort === "az"} onChange={() => setSort("az")} label="A–Z" />
      </Group>
      <Group title="Body system" count={systems.length}>
        {systemCounts.map(([s, n]) => (
          <Choice
            key={s}
            type="checkbox"
            name="system"
            checked={systems.includes(s)}
            onChange={() => setSystems((cur) => (cur.includes(s) ? cur.filter((x) => x !== s) : [...cur, s]))}
            label={s}
            count={n}
          />
        ))}
      </Group>
    </div>
  );

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[15rem_minmax(0,1fr)]">
      <aside className="lg:sticky lg:top-24 lg:self-start">
        <details className="rounded-xl border border-border/80 bg-card p-4 shadow-sm lg:hidden">
          <summary className="cursor-pointer text-sm font-semibold text-card-foreground">
            Filters{active ? " (on)" : ""}
          </summary>
          <div className="mt-4">{panel}</div>
        </details>
        <div className="hidden rounded-xl border border-border/80 bg-card p-4 shadow-sm lg:block">{panel}</div>
      </aside>

      <section aria-label="Topic reviews">
        <div className="mb-4 flex items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground" aria-live="polite">
            <strong className="font-semibold text-foreground">{shown.length}</strong> {shown.length === 1 ? "review" : "reviews"}
          </p>
          <div role="group" aria-label="Layout" className="flex rounded-lg border border-border bg-card p-0.5">
            {(["cards", "list"] as const).map((v) => (
              <button
                key={v}
                type="button"
                aria-pressed={view === v}
                onClick={() => setView(v)}
                className={cn("rounded-md px-2.5 py-1 text-xs font-medium transition-colors", view === v ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground")}
              >
                {v === "cards" ? "Cards" : "List"}
              </button>
            ))}
          </div>
        </div>

        {shown.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
            No reviews match these filters.{" "}
            <button type="button" onClick={clear} className="font-medium text-brand-700 underline">Clear all</button>
          </div>
        ) : view === "cards" ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {shown.map((r) => (
              <Link key={r.slug} href={`/study/reviews/${r.slug}`} prefetch={false} className="group">
                <Card interactive className="flex h-full flex-col">
                  <div className="flex items-start justify-between gap-2">
                    <span className="rounded-full bg-brand-100 px-2.5 py-0.5 text-xs font-semibold text-brand-800">{r.system}</span>
                    <StatusBadge item={r} staff={staff} />
                  </div>
                  <h3 className="mt-3 font-heading text-base font-semibold text-card-foreground transition-colors group-hover:text-primary">
                    {r.title} <span className="inline-block transition-transform duration-200 group-hover:translate-x-1">→</span>
                  </h3>
                  <p className="mt-auto pt-3 text-xs text-muted-foreground">8 sections + a practice question · 10–15 min</p>
                </Card>
              </Link>
            ))}
          </div>
        ) : (
          <ul className="divide-y divide-border/70 overflow-hidden rounded-xl border border-border/80 bg-card shadow-sm">
            {shown.map((r) => (
              <li key={r.slug}>
                <Link href={`/study/reviews/${r.slug}`} prefetch={false} className="group flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium text-card-foreground group-hover:text-primary">{r.title}</span>
                    <span className="block text-xs text-muted-foreground">{r.system} · 10–15 min</span>
                  </span>
                  <StatusBadge item={r} staff={staff} />
                  <span aria-hidden className="text-muted-foreground">→</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function StatusBadge({ item, staff }: { item: LibraryItem; staff: boolean }) {
  if (staff) return <Badge tone={item.status === "published" ? "green" : "amber"} dot>{item.status === "published" ? "Published" : "Draft"}</Badge>;
  if (item.read) return <Badge tone="green" dot>Read</Badge>;
  if (item.focus) return <Badge tone="purple" dot>Focus area</Badge>;
  return null;
}

function Group({ title, count, children }: { title: string; count?: number; children: React.ReactNode }) {
  return (
    <fieldset className="border-t border-border/70 pt-3">
      <legend className="flex items-center gap-1.5 pb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
        {count ? <span className="rounded-full bg-brand-100 px-1.5 text-[10px] text-brand-800">{count}</span> : null}
      </legend>
      <div className="space-y-0.5">{children}</div>
    </fieldset>
  );
}

function Choice({ type, name, checked, onChange, label, count }: { type: "radio" | "checkbox"; name: string; checked: boolean; onChange: () => void; label: string; count?: number }) {
  return (
    <label className={cn("flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-muted", checked ? "bg-muted text-foreground" : "text-card-foreground")}>
      <input type={type} name={name} checked={checked} onChange={onChange} className="h-3.5 w-3.5 accent-[hsl(var(--primary))]" />
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {count !== undefined ? <span className="text-xs tabular-nums text-muted-foreground">{count}</span> : null}
    </label>
  );
}

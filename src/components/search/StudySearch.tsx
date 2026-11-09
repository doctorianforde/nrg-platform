"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/cn";
import { loadSearchIndex, type SearchEntry } from "@/lib/search/actions";

const KIND_LABEL: Record<SearchEntry["kind"], string> = { page: "Pages", review: "Topic reviews", domain: "Practise a domain", recording: "Recordings" };
const MAX = 12;

function score(e: SearchEntry, words: string[]): number {
  if (words.length === 0) return e.kind === "page" ? 1 : 0;
  const title = e.title.toLowerCase();
  const rest = [e.hint, ...e.terms].join(" ").toLowerCase();
  let s = 0;
  for (const w of words) {
    if (title.startsWith(w)) s += 4;
    else if (title.includes(w)) s += 3;
    else if (rest.includes(w)) s += 1;
    else return 0; // every word must match somewhere
  }
  return s;
}

/**
 * Student search (Ctrl+K / ⌘K, or "/"): jump to any study page, published topic review, or a domain's practice. The
 * index loads on first open, so pages that never open search pay nothing for it.
 */
export function StudySearch() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [index, setIndex] = useState<SearchEntry[] | null>(null);
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const opener = useRef<HTMLElement | null>(null);

  const show = useCallback(() => {
    opener.current = document.activeElement as HTMLElement | null;
    setOpen(true);
  }, []);
  const close = useCallback(() => {
    setOpen(false);
    setQ("");
    setActive(0);
    opener.current?.focus?.();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      const typing = !!t && (t.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName));
      if ((e.key.toLowerCase() === "k" && (e.metaKey || e.ctrlKey)) || (e.key === "/" && !typing && !e.metaKey && !e.ctrlKey)) {
        e.preventDefault();
        if (open) close();
        else show();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, close, show]);

  useEffect(() => {
    if (!open) return;
    input.current?.focus();
    if (!index) void loadSearchIndex().then(setIndex).catch(() => setIndex([]));
  }, [open, index]);

  const results = useMemo(() => {
    const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return (index ?? [])
      .map((e) => ({ e, s: score(e, words) }))
      .filter((x) => x.s > 0)
      .sort((a, b) => b.s - a.s)
      .slice(0, MAX)
      .map((x) => x.e);
  }, [index, q]);

  const go = (e: SearchEntry | undefined) => {
    if (!e) return;
    close();
    router.push(e.href);
  };

  // Detected after mount so the server render and the first client render agree (no hydration mismatch).
  const [mac, setMac] = useState(false);
  useEffect(() => setMac(/Mac|iPhone|iPad/.test(navigator.platform)), []);

  return (
    <>
      <button
        type="button"
        onClick={show}
        aria-label="Search the study area"
        title={`Search (${mac ? "⌘" : "Ctrl+"}K)`}
        className="flex h-8 items-center gap-2 rounded-full border border-border px-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring lg:px-3"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4" aria-hidden="true">
          <circle cx="11" cy="11" r="6.5" />
          <path strokeLinecap="round" d="M16 16l4 4" />
        </svg>
        <span className="hidden lg:inline">Search</span>
        <kbd className="hidden rounded border border-border bg-muted px-1 font-mono text-[10px] lg:inline">{mac ? "⌘K" : "Ctrl K"}</kbd>
      </button>

      {open ? (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 px-4 pt-[12vh] motion-safe:animate-fade-in" onMouseDown={(e) => e.target === e.currentTarget && close()}>
          <div role="dialog" aria-modal="true" aria-label="Search the study area" className="w-full max-w-lg overflow-hidden rounded-xl border border-border bg-popover text-popover-foreground shadow-2xl">
            <div className="flex items-center gap-2 border-b border-border px-4">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true">
                <circle cx="11" cy="11" r="6.5" />
                <path strokeLinecap="round" d="M16 16l4 4" />
              </svg>
              <input
                ref={input}
                value={q}
                onChange={(e) => { setQ(e.target.value); setActive(0); }}
                onKeyDown={(e) => {
                  if (e.key === "ArrowDown") { e.preventDefault(); setActive((i) => Math.min(i + 1, results.length - 1)); }
                  else if (e.key === "ArrowUp") { e.preventDefault(); setActive((i) => Math.max(i - 1, 0)); }
                  else if (e.key === "Enter") { e.preventDefault(); go(results[active]); }
                  else if (e.key === "Escape") { e.preventDefault(); close(); }
                }}
                placeholder="Search topics, reviews and pages…"
                role="combobox"
                aria-expanded="true"
                aria-controls="study-search-results"
                aria-activedescendant={results[active] ? `study-search-${active}` : undefined}
                className="h-12 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              />
              <kbd className="rounded border border-border bg-muted px-1.5 font-mono text-[10px] text-muted-foreground">Esc</kbd>
            </div>
            <ul id="study-search-results" role="listbox" aria-label="Results" className="max-h-[50vh] overflow-y-auto p-1.5">
              {index === null ? (
                <li className="px-3 py-6 text-center text-sm text-muted-foreground">Loading…</li>
              ) : results.length === 0 ? (
                <li className="px-3 py-6 text-center text-sm text-muted-foreground">Nothing found for “{q}”.</li>
              ) : (
                results.map((e, i) => (
                  <li
                    key={e.href}
                    id={`study-search-${i}`}
                    role="option"
                    aria-selected={i === active}
                    onMouseMove={() => setActive(i)}
                    onClick={() => go(e)}
                    className={cn("flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2", i === active ? "bg-muted" : "")}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{e.title}</span>
                      <span className="block truncate text-xs text-muted-foreground">{e.hint}</span>
                    </span>
                    <span className="shrink-0 text-[10px] uppercase tracking-wide text-muted-foreground">{KIND_LABEL[e.kind]}</span>
                  </li>
                ))
              )}
            </ul>
            <p className="border-t border-border px-4 py-2 text-[11px] text-muted-foreground">
              <kbd className="font-mono">↑</kbd> <kbd className="font-mono">↓</kbd> to move · <kbd className="font-mono">Enter</kbd> to open · <kbd className="font-mono">/</kbd> or {mac ? "⌘K" : "Ctrl K"} anywhere
            </p>
          </div>
        </div>
      ) : null}
    </>
  );
}

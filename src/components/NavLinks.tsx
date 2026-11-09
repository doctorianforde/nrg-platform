"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";

export type NavItem = { href: string; label: string; group?: string };

/** Top navigation with an active-page pill. Longest-prefix match so /study/profile lights "Profile", not "Study". */
export function NavLinks({ items }: { items: NavItem[] }) {
  const pathname = usePathname() ?? "";
  const active = items.reduce<NavItem | null>((best, n) => {
    const hit = pathname === n.href || pathname.startsWith(n.href + "/");
    if (!hit) return best;
    return !best || n.href.length > best.href.length ? n : best;
  }, null);
  const pill = (on: boolean) =>
    cn(
      "whitespace-nowrap rounded-full px-3.5 py-1.5 font-medium transition-colors",
      on ? "bg-brand-100 text-brand-800 shadow-sm" : "text-muted-foreground hover:bg-brand-50/70 hover:text-brand-700"
    );
  // Grouped items (e.g. the admin pages) render once, as a menu, where the group's first item stands.
  const seen = new Set<string>();
  return (
    <nav className="hidden md:flex gap-1 text-sm">
      {items.map((n) => {
        if (n.group) {
          if (seen.has(n.group)) return null;
          seen.add(n.group);
          const members = items.filter((m) => m.group === n.group);
          return <NavMenu key={`group-${n.group}`} label={n.group} items={members} activeHref={active?.href} pill={pill} />;
        }
        const isActive = active?.href === n.href;
        return (
          <Link key={n.href} href={n.href} aria-current={isActive ? "page" : undefined} className={pill(isActive)}>
            {n.label}
          </Link>
        );
      })}
    </nav>
  );
}

function NavMenu({ label, items, activeHref, pill }: { label: string; items: NavItem[]; activeHref?: string; pill: (on: boolean) => string }) {
  const ref = useRef<HTMLDetailsElement>(null);
  const pathname = usePathname();
  const on = items.some((i) => i.href === activeHref);
  useEffect(() => {
    if (ref.current) ref.current.open = false; // close after navigating
  }, [pathname]);
  useEffect(() => {
    const close = (e: MouseEvent | KeyboardEvent) => {
      const d = ref.current;
      if (!d?.open) return;
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !d.contains(e.target as Node)) d.open = false;
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, []);
  return (
    <details ref={ref} className="relative">
      <summary className={cn(pill(on), "flex cursor-pointer list-none items-center gap-1 [&::-webkit-details-marker]:hidden")}>
        {label}
        <svg viewBox="0 0 12 12" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M3 4.5l3 3 3-3" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </summary>
      <div className="absolute left-0 top-10 z-30 w-52 rounded-xl border border-border bg-popover p-1.5 text-popover-foreground shadow-lg">
        {items.map((i) => (
          <Link key={i.href} href={i.href} aria-current={i.href === activeHref ? "page" : undefined}
            className={cn("block rounded-lg px-3 py-1.5 text-sm hover:bg-muted", i.href === activeHref && "bg-muted font-semibold")}>
            {i.label}
          </Link>
        ))}
      </div>
    </details>
  );
}

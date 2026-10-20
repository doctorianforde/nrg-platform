"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";

export type NavItem = { href: string; label: string };

/** Top navigation with an active-page pill. Longest-prefix match so /study/profile lights "Profile", not "Study". */
export function NavLinks({ items }: { items: NavItem[] }) {
  const pathname = usePathname() ?? "";
  const active = items.reduce<NavItem | null>((best, n) => {
    const hit = pathname === n.href || pathname.startsWith(n.href + "/");
    if (!hit) return best;
    return !best || n.href.length > best.href.length ? n : best;
  }, null);
  return (
    <nav className="hidden md:flex gap-1 text-sm">
      {items.map((n) => {
        const isActive = active?.href === n.href;
        return (
          <Link
            key={n.href}
            href={n.href}
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "whitespace-nowrap rounded-full px-3.5 py-1.5 font-medium transition-colors",
              isActive
                ? "bg-brand-100 text-brand-800 shadow-sm"
                : "text-muted-foreground hover:bg-brand-50/70 hover:text-brand-700"
            )}
          >
            {n.label}
          </Link>
        );
      })}
    </nav>
  );
}

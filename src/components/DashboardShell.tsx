import Link from "next/link";
import Image from "next/image";
import type { Profile } from "@/lib/auth/session";
import { hasAtLeast } from "@/lib/auth/roles";
import { Avatar } from "@/components/ui/Avatar";
import { BadgeCelebrationsServer } from "@/components/badges/BadgeCelebrationsServer";
import { flags } from "@/lib/flags";
import { ContentProtection } from "@/components/ContentProtection";
import { ThemeQuickSwitch } from "@/components/theme/ThemeQuickSwitch";
import { NavLinks } from "@/components/NavLinks";

const NAV: Array<{ href: string; label: string; min: Profile["role"]; rankingV2?: boolean }> = [
  { href: "/study", label: "Study", min: "student" },
  { href: "/study/trophies", label: "Trophies", min: "student", rankingV2: true },
  { href: "/study/submit", label: "Write a question", min: "student" },
  { href: "/study/profile", label: "Profile", min: "student" },
  { href: "/teacher", label: "Teacher", min: "teacher" },
  { href: "/teacher/messages", label: "Messages", min: "teacher" },
  { href: "/teacher/case-studies", label: "Case studies", min: "teacher" },
  { href: "/admin", label: "Admin", min: "admin" },
  { href: "/admin/watermark", label: "Reveal watermark", min: "admin" },
  { href: "/super-admin", label: "Super admin", min: "super_admin" },
];

export function DashboardShell({
  profile,
  email,
  title,
  eyebrow,
  subtitle,
  protect = true,
  children,
}: {
  profile: Profile;
  email: string | undefined;
  title: string;
  /** Small uppercase label above the title, per the reference banner pattern. */
  eyebrow?: string;
  /** One-sentence gray subtitle below the title. */
  subtitle?: string;
  /**
   * Content protection (watermark, no copy/print, screen shield) for students. On by default so any new student page
   * that shows questions is covered; pass false on pages that show only the student's own material (profile, threads,
   * trophies, their submissions). Never applies to teachers, admins or super admins.
   */
  protect?: boolean;
  children: React.ReactNode;
}) {
  const protectedView = protect && flags.contentProtection && profile.role === "student";
  const navItems = NAV.filter(
    (n) => hasAtLeast(profile.role, n.min) && (!n.rankingV2 || (flags.rankingV2 && profile.role === "student"))
  ).map(({ href, label }) => ({ href, label }));
  return (
    // The watermark paints on this element's background (ContentProtection targets [data-page-background]),
    // so it must keep a plain colour: no decorative background-image here, ever.
    <div className="min-h-screen bg-muted" data-page-background="">
      <header className="sticky top-0 z-20 border-b border-border/70 bg-card/90 shadow-sm backdrop-blur-md supports-[backdrop-filter]:bg-card/75">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-6 px-4">
          <Link href="/" className="group flex items-center gap-2.5 font-brand font-bold tracking-tight text-brand-800">
            <span className="relative flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-brand-500 to-brand-800 p-[5px] shadow-sm transition-transform motion-safe:group-hover:scale-105">
              <Image src="/images/nrg-logo.png" alt="NRG" width={28} height={28} className="rounded-sm" />
            </span>
            <span className="leading-tight">
              NRG <span className="font-normal opacity-70">Platform</span>
            </span>
          </Link>
          <NavLinks items={navItems} />
          <div className="ml-auto flex items-center gap-3 text-xs">
            {profile.role === "student" ? <ThemeQuickSwitch /> : null}
            <span className="rounded-full bg-gradient-to-br from-brand-400 to-brand-700 p-[2px]">
              <Avatar
                name={profile.full_name}
                url={profile.avatar_url}
                seed={profile.id}
                size={30}
              />
            </span>
            <span className="rounded-full bg-brand-100 px-2.5 py-1 font-semibold uppercase tracking-wide text-brand-800">
              {profile.role.replace("_", " ")}
            </span>
            <span className="hidden opacity-80 sm:inline">{email}</span>
            <form action="/auth/signout" method="post">
              <button className="whitespace-nowrap rounded-full border border-border px-3 py-1 font-medium text-muted-foreground transition-colors hover:border-brand-300 hover:bg-muted hover:text-foreground">
                Sign out
              </button>
            </form>
          </div>
        </div>
      </header>

      {/* Banner page-header pattern (purple on Royal; each theme sets its own gradient), with soft light blooms and a
          faint dot lattice — the band is opaque, so none of this touches the watermark layer behind the content. */}
      <div className="relative isolate overflow-hidden bg-gradient-to-r from-header-from via-header-via to-header-to text-header-foreground">
        <div aria-hidden className="hero-ornament absolute inset-0" />
        <div aria-hidden className="hero-dots absolute inset-0 opacity-40 [mask-image:linear-gradient(to_bottom,transparent,black_60%)]" />
        {/* The band melts into the page colour, so overlapped content always sits on (near-)page background. */}
        <div aria-hidden className="absolute inset-x-0 bottom-0 h-12 bg-gradient-to-b from-transparent to-muted" />
        <div className="relative mx-auto max-w-6xl px-4 pb-16 pt-9">
          {eyebrow ? (
            <p className="mb-2 inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-header-muted">
              <span aria-hidden className="h-px w-6 bg-header-muted/70" />
              {eyebrow}
            </p>
          ) : null}
          <h1 className="font-heading text-3xl font-bold tracking-tight drop-shadow-sm">{title}</h1>
          {subtitle ? <p className="mt-2 max-w-2xl text-sm text-header-muted">{subtitle}</p> : null}
        </div>
      </div>

      {/* Content overlaps the banner's lower edge, so the first row of cards floats on the gradient. */}
      <main className="relative z-10 mx-auto -mt-8 max-w-6xl px-4 pb-12">
        {protectedView ? (
          <ContentProtection
            identity={[profile.full_name, email, profile.id.slice(0, 8)].filter(Boolean).join(" · ")}
            date={new Date().toISOString().slice(0, 10)}
          >
            {children}
          </ContentProtection>
        ) : (
          children
        )}
      </main>
      {/* Trophies: newly earned badges celebrate here (students only; staging until ranking v2 goes live). */}
      {flags.rankingV2 && profile.role === "student" ? <BadgeCelebrationsServer userId={profile.id} /> : null}
    </div>
  );
}

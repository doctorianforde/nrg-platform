import Link from "next/link";
import Image from "next/image";
import type { Profile } from "@/lib/auth/session";
import { hasAtLeast } from "@/lib/auth/roles";
import { Avatar } from "@/components/ui/Avatar";

const NAV: Array<{ href: string; label: string; min: Profile["role"] }> = [
  { href: "/study", label: "Study", min: "student" },
  { href: "/study/profile", label: "Profile", min: "student" },
  { href: "/teacher", label: "Teacher", min: "teacher" },
  { href: "/teacher/messages", label: "Messages", min: "teacher" },
  { href: "/admin", label: "Admin", min: "admin" },
  { href: "/super-admin", label: "Super admin", min: "super_admin" },
];

export function DashboardShell({
  profile,
  email,
  title,
  eyebrow,
  subtitle,
  children,
}: {
  profile: Profile;
  email: string | undefined;
  title: string;
  /** Small uppercase label above the title, per the reference banner pattern. */
  eyebrow?: string;
  /** One-sentence gray subtitle below the title. */
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-muted">
      <header className="sticky top-0 z-20 bg-white/95 backdrop-blur border-b border-brand-100 shadow-sm">
        <div className="mx-auto max-w-6xl px-4 h-16 flex items-center gap-6">
          <Link href="/" className="flex items-center gap-2 font-brand font-bold tracking-tight text-brand-800">
            <Image
              src="/images/nrg-logo.png"
              alt="NRG"
              width={32}
              height={32}
              className="rounded"
            />
            <span>
              NRG <span className="font-normal opacity-70">Platform</span>
            </span>
          </Link>
          <nav className="hidden md:flex gap-1 text-sm">
            {NAV.filter((n) => hasAtLeast(profile.role, n.min)).map((n) => (
              <Link
                key={n.href}
                href={n.href}
                className="rounded-lg px-3 py-2 text-gray-600 hover:bg-brand-50/50 hover:text-brand-700"
              >
                {n.label}
              </Link>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-3 text-xs">
            <Avatar
              name={profile.full_name}
              url={profile.avatar_url}
              seed={profile.id}
              size={32}
            />
            <span className="rounded bg-brand-100 px-2 py-0.5 uppercase tracking-wide text-brand-800">
              {profile.role.replace("_", " ")}
            </span>
            <span className="opacity-80 hidden sm:inline">{email}</span>
            <form action="/auth/signout" method="post">
              <button className="rounded border border-border px-2 py-0.5 hover:bg-muted">
                Sign out
              </button>
            </form>
          </div>
        </div>
      </header>

      {/* Purple banner page-header pattern from the reference design */}
      <div className="bg-gradient-to-r from-brand-900 via-brand-700 to-brand-900 text-white">
        <div className="mx-auto max-w-6xl px-4 py-8">
          {eyebrow ? (
            <p className="mb-1 text-xs font-semibold uppercase tracking-widest text-brand-200">
              {eyebrow}
            </p>
          ) : null}
          <h1 className="font-heading text-2xl font-bold">{title}</h1>
          {subtitle ? <p className="mt-1 text-sm text-purple-100">{subtitle}</p> : null}
        </div>
      </div>

      <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
    </div>
  );
}

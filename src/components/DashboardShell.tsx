import Link from "next/link";
import Image from "next/image";
import type { Profile } from "@/lib/auth/session";
import { hasAtLeast } from "@/lib/auth/roles";

const NAV: Array<{ href: string; label: string; min: Profile["role"] }> = [
  { href: "/study", label: "Study", min: "student" },
  { href: "/teacher", label: "Teacher", min: "teacher" },
  { href: "/admin", label: "Admin", min: "admin" },
  { href: "/super-admin", label: "Super admin", min: "super_admin" },
];

export function DashboardShell({
  profile,
  email,
  title,
  children,
}: {
  profile: Profile;
  email: string | undefined;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-muted">
      <header className="bg-brand-700 text-white shadow-sm">
        <div className="mx-auto max-w-6xl px-4 h-14 flex items-center gap-6">
          <Link href="/" className="flex items-center gap-2 font-brand font-bold tracking-tight">
            <Image
              src="/images/nrg-logo.png"
              alt="NRG"
              width={28}
              height={28}
              className="rounded"
            />
            <span>
              NRG <span className="font-normal opacity-70">Platform</span>
            </span>
          </Link>
          <nav className="flex gap-4 text-sm">
            {NAV.filter((n) => hasAtLeast(profile.role, n.min)).map((n) => (
              <Link key={n.href} href={n.href} className="opacity-90 hover:opacity-100">
                {n.label}
              </Link>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-3 text-xs">
            <span className="rounded bg-white/15 px-2 py-0.5 uppercase tracking-wide">
              {profile.role.replace("_", " ")}
            </span>
            <span className="opacity-80 hidden sm:inline">{email}</span>
            <form action="/auth/signout" method="post">
              <button className="rounded border border-white/40 px-2 py-0.5 hover:bg-white/10">
                Sign out
              </button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8">
        <h1 className="text-xl font-semibold mb-4">{title}</h1>
        {children}
      </main>
    </div>
  );
}

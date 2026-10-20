import Link from "next/link";
import Image from "next/image";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="relative isolate flex min-h-screen items-center justify-center overflow-hidden bg-gradient-to-br from-header-from via-header-via to-header-to px-4 py-12">
      {/* Soft light blooms + dot lattice, same vocabulary as the in-app page banner. */}
      <div aria-hidden className="hero-ornament absolute inset-0" />
      <div aria-hidden className="hero-dots absolute inset-0 opacity-30 [mask-image:radial-gradient(60rem_40rem_at_50%_0%,black,transparent_70%)]" />
      <div className="relative w-full max-w-sm motion-safe:animate-rise-in">
        <Link href="/" className="mb-8 flex items-center justify-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/10 p-1.5 shadow-lg ring-1 ring-white/20 backdrop-blur">
            <Image src="/images/nrg-logo.png" alt="" width={34} height={34} className="rounded-md" />
          </span>
          <span className="text-2xl font-bold tracking-tight text-header-foreground">
            NRG <span className="font-normal opacity-80">Platform</span>
          </span>
        </Link>
        <div className="rounded-2xl border border-white/20 bg-card p-6 shadow-2xl">
          {children}
        </div>
        <p className="mt-6 text-center text-xs text-header-muted">
          RENR exam preparation — practice, flashcards, case studies and mock exams.
        </p>
      </div>
    </main>
  );
}

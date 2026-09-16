import Link from "next/link";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen flex items-center justify-center bg-[hsl(270,30%,97%)] px-4 py-12">
      <div className="w-full max-w-sm">
        <Link href="/" className="block text-center mb-8">
          <span className="text-2xl font-bold tracking-tight text-[hsl(270,60%,35%)]">
            NRG <span className="font-normal opacity-70">Platform</span>
          </span>
        </Link>
        <div className="rounded-xl bg-white shadow-sm border border-[hsl(270,15%,88%)] p-6">
          {children}
        </div>
      </div>
    </main>
  );
}

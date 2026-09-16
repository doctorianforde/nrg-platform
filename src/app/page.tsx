import Link from "next/link";
import { getSession } from "@/lib/auth/session";
import { ROLE_HOME } from "@/lib/auth/roles";

export const dynamic = "force-dynamic";

export default async function Home() {
  const session = await getSession();
  const dashboard = session?.profile ? ROLE_HOME[session.profile.role] : null;

  return (
    <main className="min-h-screen flex flex-col items-center justify-center gap-6 bg-[hsl(270,30%,97%)] px-4 text-center">
      <h1 className="text-4xl font-bold tracking-tight text-[hsl(270,60%,35%)]">
        NRG <span className="font-normal opacity-70">Platform</span>
      </h1>
      <p className="max-w-md text-gray-700">
        Nursing exam preparation for the RENR — practice questions, flashcards, case
        studies and mock exams.
      </p>
      <div className="flex gap-3">
        {dashboard ? (
          <Link
            href={dashboard}
            className="rounded-md bg-[hsl(270,60%,35%)] px-5 py-2 text-white font-medium"
          >
            Go to dashboard
          </Link>
        ) : (
          <>
            <Link
              href="/login"
              className="rounded-md bg-[hsl(270,60%,35%)] px-5 py-2 text-white font-medium"
            >
              Sign in
            </Link>
            <Link
              href="/signup"
              className="rounded-md border border-[hsl(270,60%,35%)] px-5 py-2 text-[hsl(270,60%,35%)] font-medium"
            >
              Create account
            </Link>
          </>
        )}
      </div>
    </main>
  );
}

import Link from "next/link";
import Image from "next/image";
import { getSession } from "@/lib/auth/session";
import { PlanCards } from "@/components/plans/PlanCards";
import { loadBankSettings, loadPlans } from "@/lib/membership/queries";
import { loadFreeLimits } from "@/lib/membership/free-limits";

export const dynamic = "force-dynamic";

/** Card payment is not built yet: shown as "coming soon". Flip when it is; nothing else on the page moves. */
const ONLINE_PAYMENTS = false;

/** Public plans page (paid plans by bank transfer, 2026-11-09). */
export default async function PlansPage() {
  const [session, plans, bank, free] = await Promise.all([getSession(), loadPlans(), loadBankSettings(), loadFreeLimits()]);
  const student = session?.profile?.role === "student";
  const signedIn = !!session?.profile;
  const payHref = (code: string) => (signedIn ? `/study/plan/pay?plan=${code}` : `/login?next=${encodeURIComponent(`/study/plan/pay?plan=${code}`)}`);

  return (
    <main className="min-h-screen bg-muted">
      <header className="relative isolate overflow-hidden bg-gradient-to-r from-header-from via-header-via to-header-to text-header-foreground">
        <div aria-hidden className="hero-ornament absolute inset-0" />
        <div className="relative mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-5">
          <Link href="/" className="flex items-center gap-2.5 font-bold">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/10 p-1 ring-1 ring-white/20">
              <Image src="/images/nrg-logo.png" alt="" width={28} height={28} className="rounded-sm" />
            </span>
            NRG <span className="font-normal opacity-80">Platform</span>
          </Link>
          <Link href={signedIn ? (student ? "/study/plan" : "/") : "/login"} className="rounded-full border border-white/30 px-3.5 py-1.5 text-sm font-medium hover:bg-white/10">
            {signedIn ? (student ? "My plan" : "Home") : "Sign in"}
          </Link>
        </div>
        <div className="relative mx-auto max-w-5xl px-4 pb-14 pt-6">
          <h1 className="font-heading text-3xl font-bold sm:text-4xl">Plans</h1>
          <p className="mt-2 max-w-2xl text-header-muted">
            Start free. Upgrade for 1 or 3 months when you&apos;re ready for unlimited practice, mock exams and case studies.
          </p>
        </div>
      </header>

      <div className="mx-auto -mt-8 max-w-5xl px-4 pb-16">
        <PlanCards
          plans={plans}
          free={free}
          ctaFor={(p) =>
            p
              ? { href: payHref(p.code), label: `Get ${p.name}` }
              : { href: signedIn ? "/study" : "/signup", label: signedIn ? "Keep studying free" : "Start free" }
          }
        />

        <div className="mt-10 grid grid-cols-1 gap-5 md:grid-cols-2">
          <section className="rounded-2xl border border-border/80 bg-card p-6 shadow-sm">
            <h2 className="font-heading text-lg font-semibold text-card-foreground">Pay by bank transfer</h2>
            <ol className="mt-3 list-decimal space-y-1.5 pl-5 text-sm text-card-foreground">
              <li>Pay the plan&apos;s price into NRG&apos;s account (transfer, online banking or a cash deposit).</li>
              <li>Use <strong>{bank.referenceHint.toLowerCase()}</strong> as the payment reference.</li>
              <li>Upload your receipt on the payment page.</li>
              <li>We match it to the bank statement within {bank.turnaroundDays} working days, and your plan starts.</li>
            </ol>
            {bank.ready ? (
              <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 rounded-xl bg-muted/70 p-4 text-sm">
                <dt className="text-muted-foreground">Bank</dt><dd className="font-medium text-card-foreground">{bank.bankName}{bank.branch ? `, ${bank.branch}` : ""}</dd>
                <dt className="text-muted-foreground">Account name</dt><dd className="font-medium text-card-foreground">{bank.accountName}</dd>
                <dt className="text-muted-foreground">Account number</dt><dd className="font-medium tabular-nums text-card-foreground">{bank.accountNumber}</dd>
              </dl>
            ) : (
              <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                NRG&apos;s bank details are being finalised. Payments open as soon as they are added.
              </p>
            )}
          </section>

          <section className={ONLINE_PAYMENTS ? "rounded-2xl border border-border/80 bg-card p-6 shadow-sm" : "rounded-2xl border border-dashed border-border bg-card/60 p-6"}>
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-heading text-lg font-semibold text-muted-foreground">Pay online by card</h2>
              <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Coming soon</span>
            </div>
            <p className="mt-3 text-sm text-muted-foreground">Card payment is on its way. Bank transfer works today.</p>
          </section>
        </div>

        <p className="mt-8 text-center text-xs text-muted-foreground">
          Prices in Trinidad and Tobago dollars. One account per person: each student account can be signed in on one device at a time.
        </p>
      </div>
    </main>
  );
}

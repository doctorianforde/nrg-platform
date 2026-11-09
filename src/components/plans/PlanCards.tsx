import Link from "next/link";
import { cn } from "@/lib/cn";
import type { FreeLimits } from "@/lib/membership/free-limits";
import { ttd, type Plan } from "@/lib/membership/queries";

/**
 * Free, 1 month and 3 months side by side. Prices come from membership_plans and the free plan's limits from
 * tier_config, so the cards always match what the database enforces. Paid by bank transfer for now; card payment is
 * a "coming soon" note under the cards (ONLINE_PAYMENTS in the plans page).
 */
export function PlanCards({ plans, free, ctaFor }: { plans: Plan[]; free: FreeLimits; ctaFor: (plan: Plan | null) => { href: string; label: string } }) {
  const monthly = plans.find((p) => p.months === 1);
  const freeCta = ctaFor(null);
  return (
    <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
      <Card
        name="Free"
        price="TT$0"
        per="always"
        features={[
          `${free.practicePerDay} practice questions a day`,
          `${free.reviewsPerDay === 1 ? "One topic review" : `${free.reviewsPerDay} topic reviews`} a day, ${free.reviewMinutes} minutes each`,
          "Flashcards",
          free.mockExams ? "Mock exams" : "No mock exams",
        ]}
        cta={freeCta}
      />
      {plans.map((p) => {
        const saving = monthly && p.months > 1 ? monthly.priceTtd * p.months - p.priceTtd : 0;
        return (
          <Card
            key={p.code}
            name={p.name}
            price={ttd(p.priceTtd)}
            per={p.months === 1 ? "for 1 month" : `for ${p.months} months`}
            highlight={p.months > 1}
            badge={saving > 0 ? `Save ${ttd(saving)}` : undefined}
            features={[
              "Unlimited practice questions",
              "Every topic review, as often as you like",
              "Mock exams with rationale release",
              "Case studies",
              p.months > 1 ? `About ${ttd(Math.round(p.priceTtd / p.months))} a month` : "Renew any time; early renewals add on",
            ]}
            cta={ctaFor(p)}
          />
        );
      })}
    </div>
  );
}

function Card({ name, price, per, features, cta, highlight = false, badge }: {
  name: string; price: string; per: string; features: string[]; cta: { href: string; label: string }; highlight?: boolean; badge?: string;
}) {
  return (
    <div className={cn("relative flex flex-col rounded-2xl border bg-card p-6 shadow-sm", highlight ? "border-primary ring-2 ring-primary/30" : "border-border/80")}>
      {badge ? (
        <span className="absolute -top-3 right-5 rounded-full bg-primary px-3 py-1 text-xs font-semibold text-primary-foreground shadow-sm">{badge}</span>
      ) : null}
      <h3 className="font-heading text-lg font-semibold text-card-foreground">{name}</h3>
      <p className="mt-3">
        <span className="font-heading text-4xl font-bold text-card-foreground">{price}</span>{" "}
        <span className="text-sm text-muted-foreground">{per}</span>
      </p>
      <ul className="mt-5 flex-1 space-y-2 text-sm text-card-foreground">
        {features.map((f) => (
          <li key={f} className="flex gap-2">
            <svg viewBox="0 0 16 16" className="mt-0.5 h-4 w-4 shrink-0 text-primary" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path d="M3.5 8.5l3 3 6-7" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            {f}
          </li>
        ))}
      </ul>
      <Link
        href={cta.href}
        className={cn(
          "mt-6 inline-flex items-center justify-center rounded-lg px-4 py-2.5 text-sm font-semibold transition-colors",
          highlight ? "bg-primary text-primary-foreground shadow-sm hover:bg-primary-hover" : "border border-border bg-card text-card-foreground hover:bg-muted"
        )}
      >
        {cta.label}
      </Link>
    </div>
  );
}

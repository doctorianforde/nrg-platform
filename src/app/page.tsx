import Link from "next/link";
import Image from "next/image";
import { getSession } from "@/lib/auth/session";
import { ROLE_HOME } from "@/lib/auth/roles";
import { createClient } from "@/lib/supabase/server";
import { KnowledgeWidget } from "@/components/KnowledgeWidget";
import { cn } from "@/lib/cn";

export const dynamic = "force-dynamic";

const FEATURES = [
  {
    href: "/study/practice",
    image: "/images/feature-practice.jpg",
    title: "Question Banks",
    body: "RENR-aligned practice with instant feedback, explanations and option rationales.",
  },
  {
    href: "/study/mock-exams",
    image: "/images/feature-mockexam.jpg",
    title: "Mock Exams",
    body: "Real exam format with teacher-controlled rationale release after class review.",
  },
  {
    href: "/study/case-studies",
    image: "/images/feature-instructor.jpg",
    title: "Clinical Case Studies",
    body: "Work through patient scenarios and apply clinical decision making.",
  },
  {
    href: "/study/flashcards",
    image: "/images/topic-anatomy.jpg",
    title: "Flashcards",
    body: "Rapid recall drills by topic to lock in the facts you must know cold.",
  },
  {
    href: "/teacher/review",
    image: "/images/feature-qgen.jpg",
    title: "Question Review",
    body: "Teachers evaluate AI-generated questions before they go live to students.",
  },
  {
    href: "/admin",
    image: "/images/feature-analytics.jpg",
    title: "Analytics",
    body: "Role dashboards tracking content, review progress and usage.",
  },
];

const JOURNEY = [
  {
    n: "01",
    title: "Review Topics",
    body: "Browse the 7 RENR domains and their high-yield topics.",
  },
  {
    n: "02",
    title: "Answer Questions",
    body: "Tutor-mode practice with instant feedback and rationales.",
  },
  {
    n: "03",
    title: "Generate Questions",
    body: "Active learning — the best way to learn is to teach.",
  },
  {
    n: "04",
    title: "Analyze",
    body: "Track review progress and focus where it counts.",
  },
];

const TESTIMONIALS = [
  {
    quote:
      "The question bank felt exactly like the real exam. I walked in calm because I had already seen the format a hundred times.",
    name: "Sarah-Marie Johnson",
    role: "RENR Candidate 2025",
  },
  {
    quote:
      "The rationales are what set NRG apart. I didn't just memorize answers — I understood why the wrong ones were wrong.",
    name: "David Williams",
    role: "Registered Nurse, Jamaica",
  },
  {
    quote:
      "Case studies made clinical decision making click for me. The scenarios feel like real Caribbean ward work.",
    name: "Keisha Thompson",
    role: "Nursing Student, Trinidad",
  },
];

// Pricing layout per the approved reference design. Prices are the prototype's
// values — confirm with Jade/Ian before enabling payments.
const PLANS = [
  {
    name: "Free",
    price: "$0",
    period: "/month",
    features: ["25 practice questions/day", "1 topic review", "1 mock exam"],
    cta: "Get Started",
    highlight: false,
  },
  {
    name: "Monthly",
    price: "$29",
    period: "/month",
    features: [
      "Unlimited practice questions",
      "All topic reviews & flashcards",
      "Full mock exams with rationale release",
    ],
    cta: "Start Monthly",
    highlight: true,
  },
  {
    name: "Full Program",
    price: "$69",
    period: "one-time",
    features: ["Everything in Monthly", "~3 months — best value", "Save $18"],
    cta: "Get Full Access",
    highlight: false,
  },
];

/** Section eyebrow: small uppercase brand label with a short rule line on each side. */
function Eyebrow({ children, onDark = false }: { children: string; onDark?: boolean }) {
  return (
    <div className="flex items-center justify-center gap-3" aria-hidden>
      <span
        className={cn("h-px w-8", onDark ? "bg-header-muted/50" : "bg-brand-300")}
      />
      <span
        className={cn(
          "text-xs font-semibold uppercase tracking-widest",
          onDark ? "text-header-muted" : "text-brand-600"
        )}
      >
        {children}
      </span>
      <span
        className={cn("h-px w-8", onDark ? "bg-header-muted/50" : "bg-brand-300")}
      />
    </div>
  );
}

export default async function Home() {
  const session = await getSession();
  const dashboard = session?.profile ? ROLE_HOME[session.profile.role] : null;
  const supabase = createClient();

  const [{ data: domains }, { count: topicCount }, { count: questionCount }] =
    await Promise.all([
      supabase.from("domains").select("id, name, code, exam_weight_pct").order("display_order"),
      supabase.from("topics").select("id", { count: "exact", head: true }).eq("is_active", true),
      supabase
        .from("questions")
        .select("id", { count: "exact", head: true })
        .eq("is_active", true),
    ]);

  const primaryCta = dashboard ?? "/signup";
  const primaryLabel = dashboard ? "Go to dashboard" : "Start Learning";

  return (
    <div className="min-h-screen bg-background">
      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden bg-gradient-to-r from-header-from via-header-via to-header-to text-header-foreground">
        <div aria-hidden className="hero-ornament absolute inset-0" />
        <div aria-hidden className="hero-dots absolute inset-0" />
        <div className="relative mx-auto grid max-w-6xl items-center gap-10 px-4 py-20 md:grid-cols-2 md:py-28">
          <div className="motion-safe:animate-rise-in">
            <span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-1.5 text-sm font-medium ring-1 ring-white/20 backdrop-blur-sm">
              <span aria-hidden className="text-gold">✦</span> Active Learning for Caribbean Nurses
            </span>
            <h1 className="mt-6 font-heading text-4xl font-extrabold leading-tight tracking-tight md:text-6xl">
              Master Your <span className="text-gold">RENR</span> Examination
            </h1>
            <p className="mt-5 max-w-lg text-lg leading-relaxed text-header-muted">
              The complete active learning platform for Caribbean nursing students.
              Question banks, topic reviews, case studies, and teacher-guided mock
              exams.
            </p>
            <div className="mt-9 flex flex-wrap gap-3">
              <Link
                href={primaryCta}
                className="rounded-lg bg-white px-6 py-3 font-semibold text-brand-800 shadow-lg transition-all hover:bg-brand-50 hover:shadow-xl motion-safe:hover:-translate-y-0.5"
              >
                {primaryLabel}
              </Link>
              <Link
                href="/study/mock-exams"
                className="rounded-lg border-2 border-white/60 px-6 py-3 font-semibold text-white transition-colors hover:border-white hover:bg-white/10"
              >
                Try Mock Exam
              </Link>
            </div>
            <div className="mt-8 flex flex-wrap gap-x-8 gap-y-2 text-sm text-header-muted">
              <span className="inline-flex items-center gap-1.5">
                <span aria-hidden className="text-gold">⭐</span> 4.9/5 Student Rating
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-gold" />
                500+ Active Students
              </span>
            </div>
          </div>
          <div className="relative hidden md:block">
            <div className="relative overflow-hidden rounded-2xl shadow-2xl ring-1 ring-white/20">
              <Image
                src="/images/hero-students.jpg"
                alt="Nursing students studying together"
                width={640}
                height={420}
                className="object-cover"
                priority
              />
              <div
                aria-hidden
                className="pointer-events-none absolute inset-0 bg-gradient-to-t from-header-from/30 to-transparent"
              />
            </div>
            <div className="absolute -top-5 -right-5 rounded-2xl border border-border/60 bg-card p-4 text-card-foreground shadow-xl motion-safe:animate-rise-in motion-safe:[animation-delay:200ms]">
              <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Pass Rate
              </div>
              <div className="font-heading text-3xl font-bold tabular-nums text-green-600">
                94%
              </div>
            </div>
            <div className="absolute -bottom-5 -left-5 rounded-2xl border border-border/60 bg-card p-4 text-card-foreground shadow-xl motion-safe:animate-rise-in motion-safe:[animation-delay:350ms]">
              <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Average Improvement
              </div>
              <div className="font-heading text-3xl font-bold tabular-nums text-brand-600">
                +32%
              </div>
            </div>
          </div>
        </div>
        <div className="relative border-t border-white/10 bg-white/5 backdrop-blur-sm">
          <div className="mx-auto flex max-w-6xl flex-wrap gap-x-12 gap-y-3 px-4 py-5 text-sm text-header-muted">
            <span className="inline-flex items-baseline gap-1.5">
              <strong className="font-heading text-lg font-bold tabular-nums text-header-foreground">
                {(topicCount ?? 0).toLocaleString()}+
              </strong>{" "}
              Topics
            </span>
            <span className="inline-flex items-baseline gap-1.5">
              <strong className="font-heading text-lg font-bold tabular-nums text-header-foreground">
                {(questionCount ?? 0).toLocaleString()}+
              </strong>{" "}
              Questions
            </span>
            <span className="inline-flex items-baseline gap-1.5">
              <strong className="font-heading text-lg font-bold tabular-nums text-header-foreground">
                {domains?.length ?? 7}
              </strong>{" "}
              RENR Domains
            </span>
          </div>
        </div>
      </section>

      {/* ── Features ─────────────────────────────────────────────────────── */}
      <section className="mx-auto max-w-6xl px-4 py-20 md:py-28">
        <Eyebrow>Study Tools</Eyebrow>
        <h2 className="mt-4 text-center font-heading text-3xl font-bold tracking-tight md:text-4xl">
          Everything You Need to <span className="text-gradient-brand">Pass RENR</span>
        </h2>
        <p className="mx-auto mt-4 max-w-2xl text-center text-lg text-muted-foreground">
          Active learning modules designed around the official RENR blueprint — domains,
          taxonomy, and high-yield topics.
        </p>
        <div className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <Link key={f.title} href={f.href} className="group">
              <div className="card-lift h-full overflow-hidden rounded-xl border border-border/80 bg-card shadow-sm">
                <div className="relative h-40 overflow-hidden">
                  <Image
                    src={f.image}
                    alt=""
                    fill
                    className="object-cover transition-transform duration-500 ease-out motion-safe:group-hover:scale-105"
                    sizes="(max-width: 640px) 100vw, 33vw"
                  />
                  <div
                    aria-hidden
                    className="pointer-events-none absolute inset-0 bg-gradient-to-t from-brand-900/40 via-transparent to-transparent"
                  />
                </div>
                <div className="p-6">
                  <h3 className="font-heading text-lg font-semibold text-card-foreground transition-colors group-hover:text-brand-700">
                    {f.title}
                  </h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                    {f.body}
                  </p>
                  <span className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-brand-600 transition-colors group-hover:text-brand-700">
                    Explore{" "}
                    <span
                      aria-hidden
                      className="transition-transform motion-safe:group-hover:translate-x-0.5"
                    >
                      ›
                    </span>
                  </span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* ── Domains ──────────────────────────────────────────────────────── */}
      <section className="border-y border-border/60 bg-muted py-20 md:py-28">
        <div className="mx-auto grid max-w-6xl items-start gap-12 px-4 md:grid-cols-2">
          <div>
            <div className="flex items-center gap-3" aria-hidden>
              <span className="h-px w-8 bg-brand-300" />
              <span className="text-xs font-semibold uppercase tracking-widest text-brand-600">
                Exam Blueprint
              </span>
            </div>
            <h2 className="mt-4 font-heading text-3xl font-bold tracking-tight md:text-4xl">
              Built Around the{" "}
              <span className="text-gradient-brand">
                {domains?.length ?? 7} RENR Domains
              </span>
            </h2>
            <div className="mt-8 space-y-5">
              {(domains ?? []).map((d) => (
                <div key={d.id}>
                  <div className="flex items-center gap-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-brand-600 to-brand-800 text-sm font-bold text-white shadow-sm">
                      {d.code}
                    </span>
                    <span className="font-medium text-card-foreground">{d.name}</span>
                    <span className="ml-auto text-sm font-semibold tabular-nums text-muted-foreground">
                      {d.exam_weight_pct ? `${d.exam_weight_pct}%` : "—"}
                    </span>
                  </div>
                  <div className="ml-12 mt-2 h-2 overflow-hidden rounded-full bg-border">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-brand-400 to-brand-600"
                      style={{ width: `${Math.min(d.exam_weight_pct ?? 0, 100)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="rounded-2xl border border-border/80 bg-card p-8 shadow-md">
            <h3 className="font-heading text-xl font-semibold">Cognitive Taxonomy Weighting</h3>
            <div className="mt-6 space-y-6">
              {[
                { label: "Application", pct: 50, note: "What should the nurse do first/best/next?" },
                { label: "Analysis / Synthesis / Evaluation", pct: 30, note: "Interpret, prioritize, evaluate outcomes." },
                { label: "Knowledge / Comprehension", pct: 20, note: "Recall facts, terms and principles." },
              ].map((t) => (
                <div key={t.label}>
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="font-medium text-card-foreground">{t.label}</span>
                    <span className="font-heading text-2xl font-bold tabular-nums text-brand-700">
                      {t.pct}%
                    </span>
                  </div>
                  <div className="mt-2 h-2 overflow-hidden rounded-full bg-border">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-brand-400 to-brand-600"
                      style={{ width: `${t.pct}%` }}
                    />
                  </div>
                  <p className="mt-1.5 text-xs text-muted-foreground">{t.note}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── Journey ──────────────────────────────────────────────────────── */}
      <section className="mx-auto max-w-6xl px-4 py-20 md:py-28">
        <Eyebrow>How It Works</Eyebrow>
        <h2 className="mt-4 text-center font-heading text-3xl font-bold tracking-tight md:text-4xl">
          Your Active Learning Journey
        </h2>
        <div className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {JOURNEY.map((s, i) => (
            <div
              key={s.n}
              className="card-lift relative rounded-xl border border-border/80 bg-card p-6 shadow-sm"
            >
              <div
                aria-hidden
                className="absolute inset-x-0 top-0 h-1 rounded-t-xl bg-gradient-to-r from-brand-400 to-brand-600 opacity-80"
              />
              <div className="font-heading text-5xl font-extrabold text-brand-100">{s.n}</div>
              <h3 className="mt-3 font-heading text-lg font-semibold text-card-foreground">
                {s.title}
              </h3>
              <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{s.body}</p>
              {i < JOURNEY.length - 1 ? (
                <span
                  aria-hidden
                  className="absolute -right-4 top-1/2 z-10 hidden -translate-y-1/2 text-2xl font-bold text-brand-300 lg:block"
                >
                  ›
                </span>
              ) : null}
            </div>
          ))}
        </div>
      </section>

      {/* ── Why active learning ──────────────────────────────────────────── */}
      <section className="relative overflow-hidden bg-gradient-to-r from-header-from via-header-via to-header-to py-20 text-header-foreground md:py-28">
        <div aria-hidden className="hero-ornament absolute inset-0" />
        <div className="relative mx-auto grid max-w-6xl items-center gap-12 px-4 md:grid-cols-2">
          <div>
            <div className="flex items-center gap-3" aria-hidden>
              <span className="h-px w-8 bg-header-muted/50" />
              <span className="text-xs font-semibold uppercase tracking-widest text-header-muted">
                The Method
              </span>
            </div>
            <h2 className="mt-4 font-heading text-3xl font-bold tracking-tight md:text-4xl">
              Why Active Learning Works
            </h2>
            <div className="mt-8 space-y-4">
              {[
                ["Higher Retention", "Creating and answering questions cements knowledge far better than passive reading."],
                ["Better Exam Performance", "Active learners score 25% higher on average."],
                ["Metacognitive Awareness", "You learn what you don't know — the fastest path to closing gaps."],
              ].map(([title, body]) => (
                <div
                  key={title}
                  className="rounded-xl bg-white/10 p-5 ring-1 ring-white/10 backdrop-blur-sm transition-colors hover:bg-white/15"
                >
                  <div className="font-heading font-semibold">{title}</div>
                  <div className="mt-1 text-sm leading-relaxed text-header-muted">{body}</div>
                </div>
              ))}
            </div>
          </div>
          <div className="relative rounded-2xl border border-border/60 bg-card p-8 text-card-foreground shadow-2xl">
            <div
              aria-hidden
              className="absolute inset-x-0 top-0 h-1 rounded-t-2xl bg-gradient-to-r from-brand-400 via-brand-600 to-brand-400"
            />
            <div className="text-xs font-semibold uppercase tracking-widest text-brand-600">
              Student Tip
            </div>
            <p className="mt-4 font-brand text-xl italic leading-relaxed">
              “The best way to learn is to teach — and creating questions is teaching
              yourself.”
            </p>
          </div>
        </div>
      </section>

      {/* ── Testimonials ─────────────────────────────────────────────────── */}
      <section className="mx-auto max-w-6xl px-4 py-20 md:py-28">
        <Eyebrow>Testimonials</Eyebrow>
        <h2 className="mt-4 text-center font-heading text-3xl font-bold tracking-tight md:text-4xl">
          What Students Say
        </h2>
        <div className="mt-14 grid gap-6 md:grid-cols-3">
          {TESTIMONIALS.map((t) => (
            <figure
              key={t.name}
              className="card-lift relative rounded-xl border border-border/80 bg-card p-7 shadow-sm"
            >
              <span
                aria-hidden
                className="pointer-events-none absolute right-5 top-2 font-heading text-7xl font-bold leading-none text-brand-200"
              >
                ”
              </span>
              <blockquote className="relative text-sm leading-relaxed text-card-foreground">
                “{t.quote}”
              </blockquote>
              <figcaption className="mt-5 flex items-center gap-3 border-t border-border/60 pt-4">
                <span
                  aria-hidden
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-brand-500 to-brand-700 text-sm font-bold text-white"
                >
                  {t.name.charAt(0)}
                </span>
                <span>
                  <span className="block font-heading text-sm font-semibold">{t.name}</span>
                  <span className="block text-xs text-muted-foreground">{t.role}</span>
                </span>
              </figcaption>
            </figure>
          ))}
        </div>
      </section>

      {/* ── Pricing (layout per reference; prices need business confirmation) ── */}
      <section className="border-y border-border/60 bg-muted py-20 md:py-28">
        <div className="mx-auto max-w-6xl px-4">
          <Eyebrow>Pricing</Eyebrow>
          <h2 className="mt-4 text-center font-heading text-3xl font-bold tracking-tight md:text-4xl">
            Choose Your Plan
          </h2>
          <p className="mt-4 text-center text-lg text-muted-foreground">
            Start free, upgrade when you are ready. No credit card required for the free
            tier.
          </p>
          <div className="mt-14 grid gap-6 md:grid-cols-3">
            {PLANS.map((p) => (
              <div
                key={p.name}
                className={cn(
                  "relative rounded-2xl border bg-card p-7",
                  p.highlight
                    ? "border-transparent shadow-xl ring-2 ring-brand-600 md:-my-3 md:py-10"
                    : "border-border/80 shadow-sm"
                )}
              >
                {p.highlight ? (
                  <span className="absolute -top-3.5 left-1/2 -translate-x-1/2 rounded-full bg-gradient-to-r from-brand-600 to-brand-800 px-4 py-1 text-xs font-semibold uppercase tracking-wide text-white shadow-md">
                    Most Popular
                  </span>
                ) : null}
                <h3 className="font-heading text-lg font-semibold text-card-foreground">
                  {p.name}
                </h3>
                <div className="mt-3 font-heading text-5xl font-extrabold tabular-nums text-brand-700">
                  {p.price}
                  <span className="ml-1 text-sm font-normal text-muted-foreground">
                    {p.period}
                  </span>
                </div>
                <ul className="mt-6 space-y-3 text-sm text-muted-foreground">
                  {p.features.map((f) => (
                    <li key={f} className="flex items-start gap-2.5">
                      <span
                        aria-hidden
                        className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-brand-100 text-[10px] font-bold text-brand-700"
                      >
                        ✓
                      </span>
                      {f}
                    </li>
                  ))}
                </ul>
                <Link
                  href={dashboard ?? "/signup"}
                  className={cn(
                    "mt-8 block rounded-lg px-6 py-3 text-center text-sm font-semibold transition-all",
                    p.highlight
                      ? "bg-primary text-primary-foreground shadow-md hover:bg-primary-hover hover:shadow-lg"
                      : "border-2 border-brand-700 text-brand-700 hover:bg-brand-50"
                  )}
                >
                  {p.cta}
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Final CTA ────────────────────────────────────────────────────── */}
      <section className="mx-auto max-w-6xl px-4 py-20">
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-header-from via-header-via to-header-to px-6 py-16 text-center text-header-foreground shadow-2xl md:px-12 md:py-20">
          <div aria-hidden className="hero-ornament absolute inset-0" />
          <div aria-hidden className="hero-dots absolute inset-0" />
          <div className="relative">
            <h2 className="font-heading text-3xl font-bold tracking-tight md:text-4xl">
              Ready to Pass Your RENR?
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-lg text-header-muted">
              Join hundreds of Caribbean nursing students preparing smarter with NRG.
            </p>
            <div className="mt-9 flex flex-wrap justify-center gap-3">
              <Link
                href={primaryCta}
                className="rounded-lg bg-white px-6 py-3 font-semibold text-brand-800 shadow-lg transition-all hover:bg-brand-50 hover:shadow-xl motion-safe:hover:-translate-y-0.5"
              >
                {primaryLabel}
              </Link>
              <Link
                href="/study"
                className="rounded-lg border-2 border-white/60 px-6 py-3 font-semibold text-white transition-colors hover:border-white hover:bg-white/10"
              >
                Browse Topics
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ── Footer ───────────────────────────────────────────────────────── */}
      <footer className="bg-brand-midnight py-16 text-brand-200/60">
        <div className="mx-auto grid max-w-6xl gap-10 px-4 md:grid-cols-4">
          <div>
            <div className="flex items-center gap-2.5 font-brand text-lg font-bold text-white">
              <Image
                src="/images/nrg-logo.png"
                alt="NRG"
                width={28}
                height={28}
                className="rounded ring-1 ring-white/20"
              />
              NRG Platform
            </div>
            <p className="mt-4 text-sm leading-relaxed">
              Nursing Review and Examination Guide — helping Caribbean nursing students
              master the RENR through active learning.
            </p>
          </div>
          <div>
            <div className="text-xs font-semibold uppercase tracking-widest text-white">
              Quick Links
            </div>
            <ul className="mt-4 space-y-2.5 text-sm">
              <li><Link className="transition-colors hover:text-white" href="/study/practice">Question Bank</Link></li>
              <li><Link className="transition-colors hover:text-white" href="/study/case-studies">Clinical Case Studies</Link></li>
              <li><Link className="transition-colors hover:text-white" href="/study/mock-exams">Mock Exams</Link></li>
            </ul>
          </div>
          <div>
            <div className="text-xs font-semibold uppercase tracking-widest text-white">
              Resources
            </div>
            <ul className="mt-4 space-y-2.5 text-sm">
              <li><Link className="transition-colors hover:text-white" href="/login">Student Portal</Link></li>
              <li><Link className="transition-colors hover:text-white" href="/login">Instructor Portal</Link></li>
            </ul>
          </div>
          <div>
            <div className="text-xs font-semibold uppercase tracking-widest text-white">
              About NRG
            </div>
            <p className="mt-4 font-brand text-sm italic leading-relaxed text-brand-200/80">
              “Active learning is the key to nursing excellence.”
            </p>
          </div>
        </div>
        <div className="mx-auto mt-12 max-w-6xl border-t border-white/10 px-4 pt-6 text-xs">
          © {new Date().getFullYear()} NRG · Made with care for Caribbean nursing students
        </div>
      </footer>

      <KnowledgeWidget />
    </div>
  );
}

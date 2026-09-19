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
    <div className="min-h-screen bg-white">
      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <section className="bg-gradient-to-br from-brand-900 via-brand-700 to-brand-800 text-white">
        <div className="mx-auto grid max-w-6xl items-center gap-10 px-4 py-16 md:grid-cols-2 md:py-24">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-1.5 text-sm">
              <span aria-hidden>✦</span> Active Learning for Caribbean Nurses
            </span>
            <h1 className="mt-6 font-heading text-4xl font-extrabold leading-tight md:text-5xl">
              Master Your <span className="text-gold">RENR</span> Examination
            </h1>
            <p className="mt-4 max-w-lg text-purple-100">
              The complete active learning platform for Caribbean nursing students.
              Question banks, topic reviews, case studies, and teacher-guided mock
              exams.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                href={primaryCta}
                className="rounded-lg bg-white px-6 py-3 font-medium text-brand-700 hover:bg-purple-50"
              >
                {primaryLabel}
              </Link>
              <Link
                href="/study/mock-exams"
                className="rounded-lg border-2 border-white/60 px-6 py-3 font-medium text-white hover:border-white"
              >
                Try Mock Exam
              </Link>
            </div>
            <div className="mt-6 flex gap-6 text-sm text-purple-100">
              <span>⭐ 4.9/5 Student Rating</span>
              <span>500+ Active Students</span>
            </div>
          </div>
          <div className="relative hidden md:block">
            <div className="relative overflow-hidden rounded-2xl shadow-2xl">
              <Image
                src="/images/hero-students.jpg"
                alt="Nursing students studying together"
                width={640}
                height={420}
                className="object-cover"
                priority
              />
            </div>
            <div className="absolute -top-4 -right-4 rounded-xl bg-white p-4 text-gray-900 shadow-xl">
              <div className="text-xs text-gray-500">Pass Rate</div>
              <div className="font-heading text-2xl font-bold text-green-600">94%</div>
            </div>
            <div className="absolute -bottom-4 -left-4 rounded-xl bg-white p-4 text-gray-900 shadow-xl">
              <div className="text-xs text-gray-500">Average Improvement</div>
              <div className="font-heading text-2xl font-bold text-brand-700">+32%</div>
            </div>
          </div>
        </div>
        <div className="border-t border-white/10">
          <div className="mx-auto flex max-w-6xl flex-wrap gap-x-12 gap-y-3 px-4 py-5 text-sm text-purple-100">
            <span>
              <strong className="text-white">{(topicCount ?? 0).toLocaleString()}+</strong> Topics
            </span>
            <span>
              <strong className="text-white">{(questionCount ?? 0).toLocaleString()}+</strong>{" "}
              Questions
            </span>
            <span>
              <strong className="text-white">{domains?.length ?? 7}</strong> RENR Domains
            </span>
          </div>
        </div>
      </section>

      {/* ── Features ─────────────────────────────────────────────────────── */}
      <section className="mx-auto max-w-6xl px-4 py-16 md:py-24">
        <h2 className="text-center font-heading text-3xl font-bold">
          Everything You Need to <span className="text-brand-700">Pass RENR</span>
        </h2>
        <p className="mx-auto mt-3 max-w-2xl text-center text-muted-foreground">
          Active learning modules designed around the official RENR blueprint — domains,
          taxonomy, and high-yield topics.
        </p>
        <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <Link key={f.title} href={f.href} className="group">
              <div className="h-full overflow-hidden rounded-xl border border-brand-100 bg-card shadow-sm transition-shadow hover:shadow-md">
                <div className="relative h-36">
                  <Image
                    src={f.image}
                    alt=""
                    fill
                    className="object-cover"
                    sizes="(max-width: 640px) 100vw, 33vw"
                  />
                </div>
                <div className="p-5">
                  <h3 className="font-heading font-semibold text-card-foreground group-hover:text-brand-700">
                    {f.title}
                  </h3>
                  <p className="mt-1 text-sm text-muted-foreground">{f.body}</p>
                  <span className="mt-3 inline-block text-sm font-medium text-brand-700">
                    Explore ›
                  </span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* ── Domains ──────────────────────────────────────────────────────── */}
      <section className="bg-muted py-16 md:py-24">
        <div className="mx-auto grid max-w-6xl items-start gap-10 px-4 md:grid-cols-2">
          <div>
            <h2 className="font-heading text-3xl font-bold">
              Built Around the{" "}
              <span className="text-brand-700">{domains?.length ?? 7} RENR Domains</span>
            </h2>
            <div className="mt-6 space-y-4">
              {(domains ?? []).map((d) => (
                <div key={d.id}>
                  <div className="flex items-center gap-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-700 text-sm font-bold text-white">
                      {d.code}
                    </span>
                    <span className="font-medium text-card-foreground">{d.name}</span>
                    <span className="ml-auto text-sm text-muted-foreground">
                      {d.exam_weight_pct ? `${d.exam_weight_pct}%` : "—"}
                    </span>
                  </div>
                  <div className="ml-12 mt-1.5 h-2 overflow-hidden rounded-full bg-border">
                    <div
                      className="h-full rounded-full bg-brand-500"
                      style={{ width: `${Math.min(d.exam_weight_pct ?? 0, 100)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="rounded-xl border border-brand-100 bg-card p-6 shadow-sm">
            <h3 className="font-heading text-lg font-semibold">Cognitive Taxonomy Weighting</h3>
            <div className="mt-5 space-y-5">
              {[
                { label: "Application", pct: 50, note: "What should the nurse do first/best/next?" },
                { label: "Analysis / Synthesis / Evaluation", pct: 30, note: "Interpret, prioritize, evaluate outcomes." },
                { label: "Knowledge / Comprehension", pct: 20, note: "Recall facts, terms and principles." },
              ].map((t) => (
                <div key={t.label}>
                  <div className="flex items-baseline justify-between">
                    <span className="font-medium text-card-foreground">{t.label}</span>
                    <span className="font-heading text-xl font-bold text-brand-700">{t.pct}%</span>
                  </div>
                  <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-border">
                    <div
                      className="h-full rounded-full bg-brand-500"
                      style={{ width: `${t.pct}%` }}
                    />
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{t.note}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── Journey ──────────────────────────────────────────────────────── */}
      <section className="mx-auto max-w-6xl px-4 py-16 md:py-24">
        <h2 className="text-center font-heading text-3xl font-bold">
          Your Active Learning Journey
        </h2>
        <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {JOURNEY.map((s, i) => (
            <div key={s.n} className="relative rounded-xl border border-brand-100 bg-card p-6 shadow-sm">
              <div className="font-heading text-4xl font-bold text-brand-100">{s.n}</div>
              <h3 className="mt-2 font-heading font-semibold text-card-foreground">{s.title}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{s.body}</p>
              {i < JOURNEY.length - 1 ? (
                <span aria-hidden className="absolute right-4 top-6 hidden text-brand-300 lg:block">
                  ›
                </span>
              ) : null}
            </div>
          ))}
        </div>
      </section>

      {/* ── Why active learning ──────────────────────────────────────────── */}
      <section className="bg-gradient-to-br from-brand-800 to-brand-900 py-16 text-white md:py-24">
        <div className="mx-auto grid max-w-6xl items-center gap-10 px-4 md:grid-cols-2">
          <div>
            <h2 className="font-heading text-3xl font-bold">Why Active Learning Works</h2>
            <div className="mt-6 space-y-4">
              {[
                ["Higher Retention", "Creating and answering questions cements knowledge far better than passive reading."],
                ["Better Exam Performance", "Active learners score 25% higher on average."],
                ["Metacognitive Awareness", "You learn what you don't know — the fastest path to closing gaps."],
              ].map(([title, body]) => (
                <div key={title} className="rounded-lg bg-white/10 p-4">
                  <div className="font-heading font-semibold">{title}</div>
                  <div className="mt-1 text-sm text-purple-100">{body}</div>
                </div>
              ))}
            </div>
          </div>
          <div className="rounded-xl bg-white p-6 text-gray-900 shadow-2xl">
            <div className="text-xs font-semibold uppercase tracking-wide text-brand-700">
              Student Tip
            </div>
            <p className="mt-3 font-brand text-lg italic">
              “The best way to learn is to teach — and creating questions is teaching
              yourself.”
            </p>
          </div>
        </div>
      </section>

      {/* ── Testimonials ─────────────────────────────────────────────────── */}
      <section className="mx-auto max-w-6xl px-4 py-16 md:py-24">
        <h2 className="text-center font-heading text-3xl font-bold">What Students Say</h2>
        <div className="mt-10 grid gap-6 md:grid-cols-3">
          {TESTIMONIALS.map((t) => (
            <figure key={t.name} className="rounded-xl border border-brand-100 bg-card p-6 shadow-sm">
              <blockquote className="text-sm text-card-foreground">“{t.quote}”</blockquote>
              <figcaption className="mt-4">
                <div className="font-heading text-sm font-semibold">{t.name}</div>
                <div className="text-xs text-muted-foreground">{t.role}</div>
              </figcaption>
            </figure>
          ))}
        </div>
      </section>

      {/* ── Pricing (layout per reference; prices need business confirmation) ── */}
      <section className="bg-muted py-16 md:py-24">
        <div className="mx-auto max-w-6xl px-4">
          <h2 className="text-center font-heading text-3xl font-bold">Choose Your Plan</h2>
          <p className="mt-3 text-center text-muted-foreground">
            Start free, upgrade when you are ready. No credit card required for the free
            tier.
          </p>
          <div className="mt-10 grid gap-6 md:grid-cols-3">
            {PLANS.map((p) => (
              <div
                key={p.name}
                className={cn(
                  "relative rounded-xl border bg-card p-6 shadow-sm",
                  p.highlight ? "border-2 border-brand-700" : "border-border"
                )}
              >
                {p.highlight ? (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-brand-700 px-3 py-0.5 text-xs font-semibold uppercase tracking-wide text-white">
                    Most Popular
                  </span>
                ) : null}
                <h3 className="font-heading font-semibold text-card-foreground">{p.name}</h3>
                <div className="mt-2 font-heading text-4xl font-bold text-brand-700">
                  {p.price}
                  <span className="text-sm font-normal text-muted-foreground">{p.period}</span>
                </div>
                <ul className="mt-4 space-y-2 text-sm text-muted-foreground">
                  {p.features.map((f) => (
                    <li key={f}>✓ {f}</li>
                  ))}
                </ul>
                <Link
                  href={dashboard ?? "/signup"}
                  className={cn(
                    "mt-6 block rounded-lg px-6 py-3 text-center text-sm font-medium",
                    p.highlight
                      ? "bg-primary text-primary-foreground hover:bg-brand-800"
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
      <section className="mx-auto max-w-6xl px-4 py-16">
        <div className="rounded-3xl bg-gradient-to-br from-brand-700 to-brand-900 px-6 py-14 text-center text-white md:px-12">
          <h2 className="font-heading text-3xl font-bold">Ready to Pass Your RENR?</h2>
          <p className="mx-auto mt-3 max-w-xl text-purple-100">
            Join hundreds of Caribbean nursing students preparing smarter with NRG.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link
              href={primaryCta}
              className="rounded-lg bg-white px-6 py-3 font-medium text-brand-700 hover:bg-purple-50"
            >
              {primaryLabel}
            </Link>
            <Link
              href="/study"
              className="rounded-lg border-2 border-white/60 px-6 py-3 font-medium text-white hover:border-white"
            >
              Browse Topics
            </Link>
          </div>
        </div>
      </section>

      {/* ── Footer ───────────────────────────────────────────────────────── */}
      <footer className="bg-brand-950 py-12 text-purple-200">
        <div className="mx-auto grid max-w-6xl gap-8 px-4 md:grid-cols-4">
          <div>
            <div className="flex items-center gap-2 font-brand font-bold text-white">
              <Image src="/images/nrg-logo.png" alt="NRG" width={28} height={28} className="rounded" />
              NRG Platform
            </div>
            <p className="mt-3 text-sm">
              Nursing Review and Examination Guide — helping Caribbean nursing students
              master the RENR through active learning.
            </p>
          </div>
          <div>
            <div className="text-sm font-semibold text-white">Quick Links</div>
            <ul className="mt-3 space-y-2 text-sm">
              <li><Link className="hover:text-white" href="/study/practice">Question Bank</Link></li>
              <li><Link className="hover:text-white" href="/study/case-studies">Clinical Case Studies</Link></li>
              <li><Link className="hover:text-white" href="/study/mock-exams">Mock Exams</Link></li>
            </ul>
          </div>
          <div>
            <div className="text-sm font-semibold text-white">Resources</div>
            <ul className="mt-3 space-y-2 text-sm">
              <li><Link className="hover:text-white" href="/login">Student Portal</Link></li>
              <li><Link className="hover:text-white" href="/login">Instructor Portal</Link></li>
            </ul>
          </div>
          <div>
            <div className="text-sm font-semibold text-white">About NRG</div>
            <p className="mt-3 font-brand text-sm italic">
              “Active learning is the key to nursing excellence.”
            </p>
          </div>
        </div>
        <div className="mx-auto mt-10 max-w-6xl border-t border-white/10 px-4 pt-6 text-xs">
          © {new Date().getFullYear()} NRG · Made with care for Caribbean nursing students
        </div>
      </footer>

      <KnowledgeWidget />
    </div>
  );
}

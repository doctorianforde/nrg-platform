import Link from "next/link";

/** Shown instead of practice or a new mock exam while today's question is due (the 24-hour rule). */
export function DailyQuestionGate({ className }: { className?: string }) {
  return (
    <section className={`mx-auto max-w-2xl rounded-2xl border border-amber-200 bg-amber-50 p-6 text-center shadow-sm ${className ?? ""}`}>
      <h2 className="font-heading text-lg font-semibold text-amber-950">Write today&apos;s question first</h2>
      <p className="mt-2 text-sm text-amber-900">
        Writing one question every 24 hours keeps practice and mock exams open. It takes about ten minutes, and the AI
        grader tells you how to make it better.
      </p>
      <Link href="/study/submit" className="mt-4 inline-block rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm hover:bg-primary-hover">
        Write my question
      </Link>
    </section>
  );
}

import { cn } from "@/lib/cn";
import type { ReviewBlock, ReviewColumn, ReviewSlide } from "@/lib/topic-reviews/types";

/*
 * A topic review's slides as reading sections. Each slide's rows keep the deck's side-by-side layout from `md` up and
 * stack on a phone. HTML comes from the importer, which keeps only p/ul/li/strong/em/br and the two colour spans.
 */

const html = (s: string) => ({ __html: s });

// Shared typography for imported HTML: bullets, bold, and the deck's red (warn) / green (good) emphasis.
const PROSE =
  "text-sm leading-relaxed text-card-foreground [&_p+p]:mt-1.5 [&_ul]:space-y-1 [&_ul]:pl-4 [&_li]:list-disc [&_li]:marker:text-brand-400 [&_strong]:font-semibold [&_.tr-warn]:text-red-700 [&_.tr-good]:text-green-700";

function Heading({ text, tone }: { text: string; tone?: "plain" | "warn" | "good" }) {
  return (
    <h4
      className={cn(
        "mb-2 font-heading text-sm font-semibold",
        tone === "warn" ? "text-red-700" : tone === "good" ? "text-green-700" : "text-brand-700"
      )}
      dangerouslySetInnerHTML={html(text)}
    />
  );
}

function Block({ block }: { block: ReviewBlock }) {
  switch (block.type) {
    case "panel":
      return (
        <div
          className={cn(
            "rounded-xl border p-4",
            block.tone === "warn"
              ? "border-red-200 bg-red-50/60"
              : block.tone === "good"
                ? "border-green-200 bg-green-50/60"
                : "border-border/80 bg-card"
          )}
        >
          {block.heading ? <Heading text={block.heading} tone={block.tone} /> : null}
          <div className={PROSE} dangerouslySetInnerHTML={html(block.html)} />
        </div>
      );
    case "table":
      return (
        <div className="rounded-xl border border-border/80 bg-card p-4">
          {block.heading ? <Heading text={block.heading} /> : null}
          <div className="-mx-4 overflow-x-auto px-4">
            <table className="w-full min-w-[28rem] border-collapse text-sm">
              {block.header.length ? (
                <thead>
                  <tr>
                    {block.header.map((h, i) => (
                      <th key={i} className="bg-primary px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-primary-foreground first:rounded-tl-lg last:rounded-tr-lg">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
              ) : null}
              <tbody>
                {block.rows.map((r, i) => (
                  <tr key={i} className="odd:bg-muted/40">
                    {r.map((c, j) => (
                      <td key={j} className={cn("border-b border-border/60 px-3 py-2 align-top text-card-foreground", j === 0 && "font-semibold")} dangerouslySetInnerHTML={html(c)} />
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      );
    case "flow":
      return (
        <ol className="space-y-2">
          {block.items.map((it, i) => (
            <li key={i} className="flex gap-3">
              <span className="flex flex-col items-center">
                <span aria-hidden className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-brand-500 to-brand-700 text-xs font-bold text-white">
                  {i + 1}
                </span>
                {i < block.items.length - 1 ? <span aria-hidden className="mt-1 w-px flex-1 bg-brand-200" /> : null}
              </span>
              <span className={cn(PROSE, "flex-1 rounded-lg border border-brand-100 bg-card px-3 py-2")} dangerouslySetInnerHTML={html(it)} />
            </li>
          ))}
        </ol>
      );
    case "callout":
      return (
        <div className={cn(PROSE, "rounded-xl border-l-4 border-brand-500 bg-brand-50 px-4 py-3")} dangerouslySetInnerHTML={html(block.html)} />
      );
  }
}

function Row({ cols }: { cols: ReviewColumn[] }) {
  return (
    <div
      className="grid gap-3 md:[grid-template-columns:var(--cols)]"
      style={{ "--cols": cols.map((c) => `minmax(0,${c.width}fr)`).join(" ") } as React.CSSProperties}
    >
      {cols.map((c, i) => (
        <div key={i} className="min-w-0 space-y-3">
          {c.blocks.map((b, j) => (
            <Block key={j} block={b} />
          ))}
        </div>
      ))}
    </div>
  );
}

export const SLIDE_ANCHOR = (s: ReviewSlide, i: number) => `${i + 1}-${s.kind}`;

export function ReviewSlides({ slides }: { slides: ReviewSlide[] }) {
  return (
    <div className="space-y-10">
      {slides.map((s, i) => (
        <section key={i} id={SLIDE_ANCHOR(s, i)} className="scroll-mt-24">
          <div className="mb-4 flex items-baseline gap-3 border-b border-border pb-2">
            <span className="font-mono text-xs font-semibold text-brand-500">{String(i + 1).padStart(2, "0")}</span>
            <div className="min-w-0">
              <h2 className="font-heading text-xl font-semibold text-foreground">{s.title}</h2>
              {s.subtitle ? <p className="text-sm text-muted-foreground">{s.subtitle}</p> : null}
            </div>
          </div>
          <div className="space-y-3">
            {s.rows.map((r, j) => (
              <Row key={j} cols={r} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

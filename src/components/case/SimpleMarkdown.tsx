import { Fragment } from "react";

/** Minimal markdown for authored teaching text: #/##/### headings, "- " bullets, **bold**, paragraphs. No HTML is ever injected. */
export function SimpleMarkdown({ text }: { text: string }) {
  // Group consecutive lines into headings, bullet lists and paragraphs.
  type Block = { kind: "h" | "ul" | "p"; lines: string[] };
  const blocks: Block[] = [];
  for (const raw of text.replace(/\r/g, "").split("\n")) {
    const line = raw.trim();
    const last = blocks[blocks.length - 1];
    if (!line) { blocks.push({ kind: "p", lines: [] }); continue; }
    if (/^#{1,3} /.test(line)) blocks.push({ kind: "h", lines: [line.replace(/^#+ /, "")] });
    else if (/^- /.test(line)) {
      if (last?.kind === "ul") last.lines.push(line.slice(2));
      else blocks.push({ kind: "ul", lines: [line.slice(2)] });
    } else if (last?.kind === "p") last.lines.push(line);
    else blocks.push({ kind: "p", lines: [line] });
  }
  return (
    <div className="space-y-3 text-sm leading-relaxed text-card-foreground">
      {blocks.filter((b) => b.lines.length).map((b, i) =>
        b.kind === "h" ? (
          <h3 key={i} className="font-heading text-base font-semibold">{b.lines[0]}</h3>
        ) : b.kind === "ul" ? (
          <ul key={i} className="list-disc space-y-1 pl-5">{b.lines.map((l, j) => <li key={j}>{inline(l)}</li>)}</ul>
        ) : (
          <p key={i}>{b.lines.map((l, j) => <Fragment key={j}>{j > 0 ? " " : null}{inline(l)}</Fragment>)}</p>
        )
      )}
    </div>
  );
}

function inline(s: string) {
  return s.split(/(\*\*[^*]+\*\*)/).map((part, i) =>
    part.startsWith("**") && part.endsWith("**") ? <strong key={i}>{part.slice(2, -2)}</strong> : <Fragment key={i}>{part}</Fragment>
  );
}

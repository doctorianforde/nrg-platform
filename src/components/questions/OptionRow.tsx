import { cn } from "@/lib/cn";

const LETTERS = "ABCDEFGH";

export type OptionState = "idle" | "selected" | "correct" | "wrong" | "missed" | "dimmed";

export function optionStateClass(state: OptionState): string {
  switch (state) {
    case "selected":
      return "border-primary bg-brand-50 text-foreground";
    case "correct":
      return "border-green-500 bg-green-50 text-green-900";
    case "wrong":
      return "border-red-400 bg-red-50 text-red-900";
    case "missed":
      return "border-green-400 bg-green-50/60 text-green-900 border-dashed";
    case "dimmed":
      return "border-border bg-card text-muted-foreground opacity-70";
    default:
      return "border-border bg-card text-card-foreground hover:border-primary/50 hover:bg-muted";
  }
}

export function OptionRow({
  index,
  body,
  state = "idle",
  marker,
  disabled,
  onClick,
}: {
  index: number;
  body: string;
  state?: OptionState;
  marker?: React.ReactNode;
  disabled?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "flex w-full items-start gap-3 rounded-md border px-4 py-3 text-left text-sm transition-colors",
        optionStateClass(state),
        disabled && state === "idle" && "cursor-default hover:border-border hover:bg-card"
      )}
    >
      <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-current text-xs font-semibold">
        {LETTERS[index] ?? index + 1}
      </span>
      <span className="whitespace-pre-line">{body}</span>
      {marker ? <span className="ml-auto shrink-0">{marker}</span> : null}
    </button>
  );
}

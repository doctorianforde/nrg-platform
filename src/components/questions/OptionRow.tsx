import { cn } from "@/lib/cn";

const LETTERS = "ABCDEFGH";

export type OptionState = "idle" | "selected" | "correct" | "wrong" | "missed" | "dimmed";

export function optionStateClass(state: OptionState): string {
  switch (state) {
    case "selected":
      return "border-primary bg-brand-50 text-foreground ring-1 ring-primary/30";
    case "correct":
      return "border-green-500 bg-green-50 text-green-900 ring-1 ring-green-300/50";
    case "wrong":
      return "border-red-400 bg-red-50 text-red-900 ring-1 ring-red-300/50";
    case "missed":
      return "border-green-400 bg-green-50/60 text-green-900 border-dashed";
    case "dimmed":
      return "border-border bg-card text-muted-foreground opacity-70";
    default:
      return "border-border bg-card text-card-foreground hover:border-primary/50 hover:bg-muted";
  }
}

/** The circled letter flips tone with the row state. */
function chipClass(state: OptionState): string {
  switch (state) {
    case "selected":
      return "bg-primary text-primary-foreground";
    case "correct":
    case "missed":
      return "bg-green-100 text-green-800";
    case "wrong":
      return "bg-red-100 text-red-800";
    case "dimmed":
      return "bg-muted text-muted-foreground";
    default:
      return "bg-brand-100 text-brand-800";
  }
}

function StateIcon({ state }: { state: OptionState }) {
  if (state === "correct" || state === "missed") {
    return (
      <svg
        viewBox="0 0 20 20"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        className="h-4 w-4 text-green-700"
        aria-hidden="true"
      >
        <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 10.5 3.5 3.5 7.5-8" />
      </svg>
    );
  }
  if (state === "wrong") {
    return (
      <svg
        viewBox="0 0 20 20"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        className="h-4 w-4 text-red-700"
        aria-hidden="true"
      >
        <path strokeLinecap="round" d="m5.5 5.5 9 9m0-9-9 9" />
      </svg>
    );
  }
  return null;
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
        "flex w-full items-start gap-3 rounded-xl border px-4 py-3.5 text-left text-sm transition-colors duration-200",
        optionStateClass(state),
        disabled && state === "idle" && "cursor-default hover:border-border hover:bg-card"
      )}
    >
      <span
        className={cn(
          "mt-[-2px] flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold transition-colors duration-200",
          chipClass(state)
        )}
      >
        {LETTERS[index] ?? index + 1}
      </span>
      <span className="whitespace-pre-line pt-0.5">{body}</span>
      <span className="ml-auto flex shrink-0 items-center gap-2 pt-0.5">
        <StateIcon state={state} />
        {marker ?? null}
      </span>
    </button>
  );
}

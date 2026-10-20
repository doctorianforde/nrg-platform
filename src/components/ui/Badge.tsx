import { cn } from "@/lib/cn";

const TONES = {
  gray: "bg-gray-100 text-gray-700 ring-gray-200/70",
  green: "bg-green-100 text-green-800 ring-green-200/70",
  amber: "bg-amber-100 text-amber-800 ring-amber-200/70",
  red: "bg-red-100 text-red-800 ring-red-200/70",
  purple: "bg-brand-100 text-brand-800 ring-brand-200/70",
  blue: "bg-blue-100 text-blue-800 ring-blue-200/70",
} as const;

const DOTS = {
  gray: "bg-gray-400",
  green: "bg-green-500",
  amber: "bg-amber-500",
  red: "bg-red-500",
  purple: "bg-brand-500",
  blue: "bg-blue-500",
} as const;

export type BadgeTone = keyof typeof TONES;

export function Badge({
  tone = "gray",
  dot = false,
  className,
  children,
}: {
  tone?: BadgeTone;
  /** Leading status dot in the tone's mid colour. */
  dot?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1",
        TONES[tone],
        className
      )}
    >
      {dot ? <span aria-hidden className={cn("h-1.5 w-1.5 rounded-full", DOTS[tone])} /> : null}
      {children}
    </span>
  );
}

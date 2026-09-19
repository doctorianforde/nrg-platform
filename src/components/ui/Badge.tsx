import { cn } from "@/lib/cn";

const TONES = {
  gray: "bg-gray-100 text-gray-700",
  green: "bg-green-100 text-green-800",
  amber: "bg-amber-100 text-amber-800",
  red: "bg-red-100 text-red-800",
  purple: "bg-brand-100 text-brand-800",
  blue: "bg-blue-100 text-blue-800",
} as const;

export type BadgeTone = keyof typeof TONES;

export function Badge({
  tone = "gray",
  className,
  children,
}: {
  tone?: BadgeTone;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
        TONES[tone],
        className
      )}
    >
      {children}
    </span>
  );
}

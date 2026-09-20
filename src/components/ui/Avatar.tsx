import Image from "next/image";
import { cn } from "@/lib/cn";

const TINTS = [
  "bg-brand-100 text-brand-700",
  "bg-blue-100 text-blue-700",
  "bg-green-100 text-green-700",
  "bg-amber-100 text-amber-700",
] as const;

export function initialsOf(name: string | null | undefined): string {
  if (!name?.trim()) return "?";
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : "";
  return (first + last).toUpperCase().slice(0, 2);
}

/** Stable tint per person, so an unpictured avatar keeps the same colour. */
function tintFor(seed: string): string {
  let n = 0;
  for (let i = 0; i < seed.length; i++) n = (n + seed.charCodeAt(i)) % TINTS.length;
  return TINTS[n];
}

/**
 * Profile picture, falling back to initials.
 *
 * `avatar_url` carries a `?v=` stamp that changes on every upload, because the
 * storage path is stable and browsers would otherwise keep showing the old image.
 */
export function Avatar({
  name,
  url,
  seed,
  size = 40,
  className,
}: {
  name: string | null | undefined;
  url?: string | null;
  /** Anything stable per person — used only to pick the fallback colour. */
  seed?: string;
  size?: number;
  className?: string;
}) {
  const label = name?.trim() || "Profile picture";

  if (url) {
    return (
      <Image
        src={url}
        alt={label}
        width={size}
        height={size}
        className={cn("shrink-0 rounded-full object-cover", className)}
        style={{ width: size, height: size }}
        unoptimized
      />
    );
  }

  return (
    <span
      aria-label={label}
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full font-semibold",
        tintFor(seed ?? label),
        className
      )}
      style={{ width: size, height: size, fontSize: Math.max(10, Math.round(size * 0.36)) }}
    >
      {initialsOf(name)}
    </span>
  );
}

import { BadgeArt } from "@/components/badges/BadgeArt";
import type { MiniBadge } from "@/lib/badges/queries";

/** A few small badges in a row, e.g. next to a name. */
export function MiniBadges({ badges, size = 22 }: { badges: MiniBadge[]; size?: number }) {
  if (!badges.length) return null;
  return (
    <span className="inline-flex items-center gap-0.5" aria-label={`Badges: ${badges.map((b) => b.name).join(", ")}`}>
      {badges.map((b) => <span key={b.code} title={b.name}><BadgeArt code={b.code} art={b.art} size={size} /></span>)}
    </span>
  );
}

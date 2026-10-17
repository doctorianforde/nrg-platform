import { BadgeArt } from "@/components/badges/BadgeArt";

const fmt = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

/** One badge in the trophy case: in colour with its date when earned, a grey silhouette with how to earn it when not. */
export function BadgeTile({ code, art, name, hint, earnedAt, size = 72 }: { code: string; art: string; name: string; hint: string; earnedAt?: string; size?: number }) {
  const earned = Boolean(earnedAt);
  return (
    <div className={`flex flex-col items-center rounded-xl border p-3 text-center ${earned ? "border-brand-100 bg-card" : "border-dashed border-border bg-muted/40"}`}
      title={earned ? `${name} · earned ${fmt(earnedAt!)}` : `${name} · ${hint}`}>
      <BadgeArt code={code} art={art} size={size} locked={!earned} />
      <p className={`mt-2 text-xs font-semibold leading-tight ${earned ? "text-card-foreground" : "text-muted-foreground"}`}>{name}</p>
      <p className={`mt-0.5 text-[11px] leading-tight ${earned ? "text-green-700" : "text-muted-foreground"}`}>{earned ? fmt(earnedAt!) : hint}</p>
    </div>
  );
}

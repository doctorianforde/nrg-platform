import { rankLevel, rankNumeral } from "@/lib/badges/types";

/**
 * One badge image from public/badges. Rank badges get their numeral drawn on the medal's empty centre (the art is
 * text-free); `locked` shows the grey silhouette used in the trophy case.
 */
export function BadgeArt({ code, art, size, locked = false, className = "" }: { code: string; art: string; size: number; locked?: boolean; className?: string }) {
  const level = rankLevel(code);
  const numeral = level !== null ? rankNumeral(level) : null;
  const src = `/badges/${art}-${size > 96 ? 512 : 128}.png`;
  const font = size * (numeral && numeral.length >= 3 ? 0.21 : numeral && numeral.length === 2 ? 0.25 : 0.29);
  return (
    <div className={`relative inline-block shrink-0 ${className}`} style={{ width: size, height: size }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt="" width={size} height={size} draggable={false}
        className={`h-full w-full select-none ${locked ? "opacity-40 grayscale" : ""}`} />
      {numeral ? (
        <span aria-hidden="true" className={`absolute font-bold leading-none text-white ${locked ? "opacity-40" : ""}`}
          style={{ left: "46.6%", top: "36.6%", transform: "translate(-50%, -50%)", fontFamily: "Georgia, 'Times New Roman', serif", fontSize: font,
            WebkitTextStroke: `${Math.max(0.5, size / 160)}px #26303a`, textShadow: "0 2px 0 rgba(0,0,0,.25)" }}>
          {numeral}
        </span>
      ) : null}
    </div>
  );
}

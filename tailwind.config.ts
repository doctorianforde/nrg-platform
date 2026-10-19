import type { Config } from "tailwindcss";
import plugin from "tailwindcss/plugin";
import twColors from "tailwindcss/colors";
import { PALETTE_STEPS, REMAPPED_PALETTES, themeCss } from "./src/lib/theme/themes";

// Design tokens extracted from OKComputer_NRG_Website_v62/assets/index-*.css
// (see PROGRESS.md). Purple primary hsl(270 60% 35%) = #6b2d8b.
// Since 2026-10-17 every colour token is a CSS variable set per theme (src/lib/theme/themes.ts); the default theme,
// Royal, keeps the original values.

type Palette = Record<(typeof PALETTE_STEPS)[number], string>;
// Read the palettes by name: some legacy aliases on the colours export warn when touched.
const PALETTES = Object.fromEntries(
  REMAPPED_PALETTES.map((n) => [n, (twColors as unknown as Record<string, Palette>)[n]])
) as Record<string, Palette>;
const hexRgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(" ");
const hsl = (v: string) => `hsl(var(--${v}) / <alpha-value>)`;
const shadow = (a: number) => `hsl(var(--shadow) / calc(${a} * var(--shadow-strength)))`;

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/lib/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // HSL triples behind variables, so opacity modifiers (bg-primary/90) work.
        background: hsl("background"),
        foreground: hsl("foreground"),
        card: hsl("card"),
        "card-foreground": hsl("card-foreground"),
        popover: hsl("popover"),
        "popover-foreground": hsl("popover-foreground"),
        primary: hsl("primary"),
        "primary-foreground": hsl("primary-foreground"),
        "primary-hover": hsl("primary-hover"),
        secondary: hsl("secondary"),
        "secondary-foreground": hsl("secondary-foreground"),
        muted: hsl("muted"),
        "muted-foreground": hsl("muted-foreground"),
        accent: hsl("accent"),
        "accent-foreground": hsl("accent-foreground"),
        destructive: hsl("destructive"),
        "destructive-foreground": hsl("destructive-foreground"),
        border: hsl("border"),
        input: hsl("input"),
        ring: hsl("ring"),
        // Page-header band (DashboardShell) and other "hero" surfaces.
        header: {
          from: hsl("header-from"),
          via: hsl("header-via"),
          to: hsl("header-to"),
          foreground: hsl("header-foreground"),
          muted: hsl("header-muted"),
        },
        // Brand scale per theme (Royal = the original purple hex values); see themes.ts for what each step is for.
        brand: Object.fromEntries(
          [...PALETTE_STEPS, "midnight"].map((s) => [s, `rgb(var(--brand-${s}) / <alpha-value>)`])
        ),
        gold: "#fbbf24",
        // Tailwind's palettes behind variables that only dark themes set; everywhere else the fallback is Tailwind's
        // own value, so light themes and staff pages render exactly as before.
        ...Object.fromEntries(
          REMAPPED_PALETTES.map((name) => [
            name,
            Object.fromEntries(
              PALETTE_STEPS.map((s) => [s, `rgb(var(--tw-${name}-${s}, ${hexRgb(PALETTES[name][s])}) / <alpha-value>)`])
            ),
          ])
        ),
      },
      boxShadow: {
        // Tailwind's default geometry; colour and strength per theme (Royal: black at the default strength).
        sm: `0 1px 2px 0 ${shadow(0.05)}`,
        DEFAULT: `0 1px 3px 0 ${shadow(0.1)}, 0 1px 2px -1px ${shadow(0.1)}`,
        md: `0 4px 6px -1px ${shadow(0.1)}, 0 2px 4px -2px ${shadow(0.1)}`,
        lg: `0 10px 15px -3px ${shadow(0.1)}, 0 4px 6px -4px ${shadow(0.1)}`,
        xl: `0 20px 25px -5px ${shadow(0.1)}, 0 8px 10px -6px ${shadow(0.1)}`,
        "2xl": `0 25px 50px -12px ${shadow(0.25)}`,
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      fontFamily: {
        // --font-body and --font-heading are set per theme (src/lib/theme/themes.ts; all self-hosted, Royal = Inter +
        // Poppins). Inter stays the fallback.
        sans: ["var(--font-body)", "var(--font-inter)", "system-ui", "sans-serif"],
        heading: ["var(--font-heading)", "var(--font-inter)", "sans-serif"],
        brand: ["var(--font-nunito)", "var(--font-inter)", "sans-serif"],
      },
      keyframes: {
        "badge-pop": {
          "0%": { transform: "scale(0.3) rotate(-14deg)", opacity: "0" },
          "60%": { transform: "scale(1.12) rotate(4deg)", opacity: "1" },
          "80%": { transform: "scale(0.96) rotate(-1deg)" },
          "100%": { transform: "scale(1) rotate(0)", opacity: "1" },
        },
        "badge-flip": { "0%": { transform: "rotateY(0deg)" }, "100%": { transform: "rotateY(180deg)" } },
        "trophy-rise": {
          "0%": { transform: "translateY(60px) scale(0.8)", opacity: "0" },
          "70%": { transform: "translateY(-8px) scale(1.04)", opacity: "1" },
          "100%": { transform: "translateY(0) scale(1)", opacity: "1" },
        },
        shine: { "0%": { transform: "translateX(-160%) skewX(-20deg)" }, "100%": { transform: "translateX(260%) skewX(-20deg)" } },
        "toast-in": { "0%": { transform: "translateX(110%)", opacity: "0" }, "100%": { transform: "translateX(0)", opacity: "1" } },
        "fade-in": { "0%": { opacity: "0" }, "100%": { opacity: "1" } },
        "rise-in": { "0%": { transform: "translateY(12px)", opacity: "0" }, "100%": { transform: "translateY(0)", opacity: "1" } },
        // Overshoot slightly on the way in so the card lands with a little weight.
        "bounce-in": {
          "0%": { transform: "translateY(14px) scale(0.96)", opacity: "0" },
          "55%": { transform: "translateY(-6px) scale(1.02)", opacity: "1" },
          "78%": { transform: "translateY(2px) scale(0.995)" },
          "100%": { transform: "translateY(0) scale(1)", opacity: "1" },
        },
        // A shorter hop, for when the content changes but the card stays put.
        "bounce-nudge": {
          "0%, 100%": { transform: "translateY(0)" },
          "35%": { transform: "translateY(-7px)" },
          "70%": { transform: "translateY(2px)" },
        },
      },
      animation: {
        // Trophies: celebration animations. Always paired with motion-safe:, with a plain fade for reduced motion.
        "badge-pop": "badge-pop 700ms cubic-bezier(0.34, 1.56, 0.64, 1) both",
        "badge-flip": "badge-flip 900ms cubic-bezier(0.45, 0, 0.2, 1) 600ms both",
        "trophy-rise": "trophy-rise 800ms cubic-bezier(0.34, 1.56, 0.64, 1) 1400ms both",
        "shine": "shine 1100ms ease-out 500ms both",
        "toast-in": "toast-in 380ms cubic-bezier(0.34, 1.56, 0.64, 1) both",
        "fade-in": "fade-in 300ms ease-out both",
        "rise-in": "rise-in 500ms ease-out both",
        "bounce-in": "bounce-in 480ms cubic-bezier(0.34, 1.56, 0.64, 1) both",
        "bounce-nudge": "bounce-nudge 420ms cubic-bezier(0.34, 1.56, 0.64, 1)",
      },
    },
  },
  // One variable block per theme: `:root, [data-theme="royal"]`, then `[data-theme="lagoon"]` etc.
  plugins: [plugin(({ addBase }) => addBase(themeCss(PALETTES)))],
};
export default config;

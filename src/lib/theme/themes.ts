/**
 * Student colour themes: the single source of truth. tailwind.config.ts turns these into CSS variables per
 * `[data-theme="…"]` (see `themeCss`), the profile picker draws its previews from them, and
 * scripts/theme-contrast.mjs checks their contrast. Safe to import anywhere (no server code, no React).
 *
 * Where a theme applies: the student study area (/study/**). Staff pages, the landing page and the auth pages always
 * use the default, so teachers and admins see exactly what they saw before themes existed.
 *
 * Token formats: core tokens are HSL triples ("270 60% 35%", used as `hsl(var(--x) / <alpha>)`); the brand scale is
 * hex here and emitted as RGB triples (used as `rgb(var(--brand-700) / <alpha>)`), so Tailwind opacity modifiers keep
 * working everywhere. Brand scale semantics: 50–300 are tints for surfaces and borders, 400–600 are mid tones for
 * bars and dots, 700–950 are strong tones for text. On a dark theme the scale runs the other way round (50 is a dark
 * tinted surface, 700 a light text tone), so `bg-brand-50 text-brand-700` reads well on every theme. Filled buttons use
 * `bg-primary text-primary-foreground hover:bg-primary-hover`, never a brand step, for the same reason.
 */

export const THEME_IDS = ["royal", "lagoon", "midnight", "sunset"] as const;
export type ThemeId = (typeof THEME_IDS)[number];
export const DEFAULT_THEME: ThemeId = "royal";

export const isThemeId = (v: unknown): v is ThemeId => typeof v === "string" && (THEME_IDS as readonly string[]).includes(v);

/** Cookie caching the signed-in user's resolved theme as `<user id>.<theme>` (src/middleware.ts keeps it in sync). */
export const THEME_COOKIE = "nrg-theme";
/** Request header the middleware sets for the root layout: the theme to render on <html>. */
export const THEME_HEADER = "x-nrg-theme";

/** Is this path inside the themed (student) area? */
export const isThemedPath = (pathname: string) => pathname === "/study" || pathname.startsWith("/study/");

export function parseThemeCookie(value: string | undefined): { uid: string; theme: ThemeId } | null {
  if (!value) return null;
  const dot = value.lastIndexOf(".");
  if (dot <= 0) return null;
  const theme = value.slice(dot + 1);
  return isThemeId(theme) ? { uid: value.slice(0, dot), theme } : null;
}

type BrandStep = 50 | 100 | 200 | 300 | 400 | 500 | 600 | 700 | 800 | 900 | 950;

export type Theme = {
  id: ThemeId;
  name: string;
  /** One line for the picker. */
  mood: string;
  dark: boolean;
  /** Font variable (from src/app/layout.tsx) for headings and the wordmark. */
  headingFont: "--font-poppins" | "--font-nunito" | "--font-inter";
  /** HSL triples. */
  tokens: {
    background: string;
    foreground: string;
    card: string;
    "card-foreground": string;
    popover: string;
    "popover-foreground": string;
    primary: string;
    "primary-foreground": string;
    "primary-hover": string;
    secondary: string;
    "secondary-foreground": string;
    muted: string;
    "muted-foreground": string;
    accent: string;
    "accent-foreground": string;
    destructive: string;
    "destructive-foreground": string;
    border: string;
    input: string;
    ring: string;
    /** Page-header band: a three-stop gradient with its own text colours. */
    "header-from": string;
    "header-via": string;
    "header-to": string;
    "header-foreground": string;
    "header-muted": string;
    /** RGB-ish HSL for shadows (alpha comes from the shadow scale). */
    shadow: string;
  };
  radius: string;
  /** Shadow strength multiplier (dark themes need more to read at all). */
  shadowStrength: number;
  /** Hex. `midnight` is the deepest tone, for overlays and backdrops. */
  brand: Record<BrandStep | "midnight", string>;
  /** Watermark ink for content protection, and its layer opacity. */
  watermark: { ink: string; opacity: number };
  /** Confetti colours for celebrations. */
  confetti: string[];
};

export const THEMES: Record<ThemeId, Theme> = {
  // The NRG brand as it has always been: values identical to the pre-theme build, so staff pages are unchanged.
  royal: {
    id: "royal",
    name: "Royal",
    mood: "The NRG classic: regal purple, crisp and focused.",
    dark: false,
    headingFont: "--font-poppins",
    tokens: {
      background: "0 0% 100%",
      foreground: "270 30% 15%",
      card: "0 0% 100%",
      "card-foreground": "270 30% 15%",
      popover: "0 0% 100%",
      "popover-foreground": "270 30% 15%",
      primary: "270 60% 35%",
      "primary-foreground": "0 0% 100%",
      "primary-hover": "280 53% 30%",
      secondary: "270 25% 95%",
      "secondary-foreground": "270 60% 35%",
      muted: "270 15% 96%",
      "muted-foreground": "270 10% 45%",
      accent: "270 25% 95%",
      "accent-foreground": "270 60% 35%",
      destructive: "0 84.2% 60.2%",
      "destructive-foreground": "0 0% 98%",
      border: "270 20% 90%",
      input: "270 20% 90%",
      ring: "270 60% 35%",
      "header-from": "275 57% 26%",
      "header-via": "280 51% 36%",
      "header-to": "275 57% 26%",
      "header-foreground": "0 0% 100%",
      "header-muted": "270 100% 95%",
      shadow: "0 0% 0%",
    },
    radius: "0.625rem",
    shadowStrength: 1,
    brand: {
      50: "#faf5ff",
      100: "#f3e8ff",
      200: "#e9d5ff",
      300: "#d8b4fe",
      400: "#c084fc",
      500: "#8b4fa8",
      600: "#7b3fa0",
      700: "#6b2d8b",
      800: "#5a2475",
      900: "#4a1d6a",
      950: "#2d1b4e",
      midnight: "#1a1030",
    },
    watermark: { ink: "#1f1530", opacity: 0.08 },
    confetti: ["#6B2D8B", "#A35BC9", "#F2B705", "#FFD84D", "#16A34A", "#3B82F6", "#FFFFFF"],
  },

  // Calm light theme: Caribbean shallows over warm sand. Teal primary, sand page, softer corners, rounded headings.
  lagoon: {
    id: "lagoon",
    name: "Lagoon",
    mood: "Calm Caribbean shallows: sea-glass teal on warm sand.",
    dark: false,
    headingFont: "--font-nunito",
    tokens: {
      background: "40 60% 99%",
      foreground: "195 45% 14%",
      card: "0 0% 100%",
      "card-foreground": "195 45% 14%",
      popover: "0 0% 100%",
      "popover-foreground": "195 45% 14%",
      primary: "186 78% 26%",
      "primary-foreground": "0 0% 100%",
      "primary-hover": "189 71% 21%",
      secondary: "178 45% 93%",
      "secondary-foreground": "186 78% 24%",
      muted: "38 48% 95%",
      "muted-foreground": "195 16% 36%",
      accent: "178 45% 93%",
      "accent-foreground": "186 78% 24%",
      destructive: "0 74% 52%",
      "destructive-foreground": "0 0% 100%",
      border: "38 30% 87%",
      input: "38 26% 82%",
      ring: "186 78% 30%",
      "header-from": "193 76% 17%",
      "header-via": "184 72% 27%",
      "header-to": "196 70% 22%",
      "header-foreground": "0 0% 100%",
      "header-muted": "174 64% 88%",
      shadow: "195 60% 18%",
    },
    radius: "0.875rem",
    shadowStrength: 0.8,
    brand: {
      50: "#effbfa",
      100: "#d5f3f0",
      200: "#ace7e2",
      300: "#74d3cd",
      400: "#3bb6b3",
      500: "#1b9599",
      600: "#127a84",
      700: "#0e6976",
      800: "#105565",
      900: "#124654",
      950: "#062d38",
      midnight: "#05222b",
    },
    watermark: { ink: "#0b3540", opacity: 0.08 },
    confetti: ["#0E6976", "#3BB6B3", "#F2B705", "#FFD84D", "#F97F56", "#3B82F6", "#FFFFFF"],
  },

  // Dark theme for night study: deep blue-slate (not black), low-glare lavender primary with dark text on buttons.
  midnight: {
    id: "midnight",
    name: "Midnight",
    mood: "Low-glare night study: soft lavender on deep ink.",
    dark: true,
    headingFont: "--font-inter",
    tokens: {
      background: "229 24% 11%",
      foreground: "230 30% 92%",
      card: "229 22% 14%",
      "card-foreground": "230 30% 92%",
      popover: "229 22% 16%",
      "popover-foreground": "230 30% 92%",
      primary: "255 92% 76%",
      "primary-foreground": "250 45% 12%",
      "primary-hover": "255 95% 82%",
      secondary: "246 22% 21%",
      "secondary-foreground": "250 90% 86%",
      muted: "230 26% 8%",
      "muted-foreground": "229 16% 70%",
      accent: "246 22% 21%",
      "accent-foreground": "250 90% 86%",
      destructive: "0 84% 68%",
      "destructive-foreground": "0 50% 10%",
      border: "229 18% 23%",
      input: "229 16% 30%",
      ring: "255 92% 76%",
      "header-from": "244 46% 15%",
      "header-via": "252 44% 25%",
      "header-to": "236 42% 16%",
      "header-foreground": "245 100% 97%",
      "header-muted": "248 60% 85%",
      shadow: "230 40% 3%",
    },
    radius: "0.75rem",
    shadowStrength: 2.4,
    brand: {
      50: "#1f1d36",
      100: "#2a2747",
      200: "#383260",
      300: "#4f4685",
      400: "#7a69c2",
      500: "#9481df",
      600: "#a996f0",
      700: "#c4b5fd",
      800: "#d8cdfe",
      900: "#ebe5ff",
      950: "#f5f2ff",
      midnight: "#08070f",
    },
    watermark: { ink: "#ffffff", opacity: 0.045 },
    confetti: ["#C4B5FD", "#A996F0", "#F2B705", "#FFD84D", "#4ADE80", "#60A5FA", "#FFFFFF"],
  },

  // Warm and distinctive: a Tobago sunset. Terracotta-coral primary on cream, plum-to-ember header band.
  sunset: {
    id: "sunset",
    name: "Sunset",
    mood: "Warm Tobago evening: coral, ember and cream.",
    dark: false,
    headingFont: "--font-poppins",
    tokens: {
      background: "30 100% 99%",
      foreground: "14 45% 15%",
      card: "0 0% 100%",
      "card-foreground": "14 45% 15%",
      popover: "0 0% 100%",
      "popover-foreground": "14 45% 15%",
      primary: "11 74% 40%",
      "primary-foreground": "0 0% 100%",
      "primary-hover": "9 69% 33%",
      secondary: "24 90% 95%",
      "secondary-foreground": "11 74% 36%",
      muted: "30 65% 95%",
      "muted-foreground": "14 22% 38%",
      accent: "24 90% 95%",
      "accent-foreground": "11 74% 36%",
      destructive: "354 70% 46%",
      "destructive-foreground": "0 0% 100%",
      border: "26 50% 88%",
      input: "26 40% 83%",
      ring: "11 74% 44%",
      "header-from": "333 52% 22%",
      "header-via": "6 62% 34%",
      "header-to": "20 72% 36%",
      "header-foreground": "0 0% 100%",
      "header-muted": "28 100% 90%",
      shadow: "14 60% 20%",
    },
    radius: "0.75rem",
    shadowStrength: 0.85,
    brand: {
      50: "#fff6f1",
      100: "#ffe9de",
      200: "#ffd0ba",
      300: "#fcae8a",
      400: "#f6815a",
      500: "#e55d36",
      600: "#cc4723",
      700: "#b23a1b",
      800: "#912f1b",
      900: "#76291c",
      950: "#40120b",
      midnight: "#2a0d10",
    },
    watermark: { ink: "#3b1d14", opacity: 0.08 },
    confetti: ["#B23A1B", "#F6815A", "#F2B705", "#FFD84D", "#7A2A55", "#16A34A", "#FFFFFF"],
  },
};

export const THEME_LIST: Theme[] = THEME_IDS.map((id) => THEMES[id]);

// ── CSS generation (used by tailwind.config.ts) ──────────────────────────────────────────────────────────────────

const hexToRgb = (hex: string) => {
  const h = hex.replace("#", "");
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
};
const rgbTriple = (hex: string) => hexToRgb(hex).join(" ");

/** Tailwind palettes that dark themes remap (light shades become dark tints and vice versa). Must match the list
 *  tailwind.config.ts wraps in CSS variables. */
export const REMAPPED_PALETTES = [
  "slate", "gray", "red", "orange", "amber", "yellow", "lime", "green", "emerald", "teal", "cyan", "sky", "blue",
  "indigo", "violet", "purple", "fuchsia", "pink", "rose",
] as const;
export const PALETTE_STEPS = ["50", "100", "200", "300", "400", "500", "600", "700", "800", "900", "950"] as const;

type Palette = Record<(typeof PALETTE_STEPS)[number], string>;

const mix = (a: string, b: string, t: number) => {
  // t = share of `a`
  const A = hexToRgb(a), B = hexToRgb(b);
  return A.map((v, i) => Math.round(v * t + B[i] * (1 - t))).join(" ");
};

export const hslToHex = (hsl: string) => {
  const [h, s, l] = hsl.replace(/%/g, "").split(/\s+/).map(Number);
  const S = s / 100, L = l / 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = S * Math.min(L, 1 - L);
  const f = (n: number) => L - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return "#" + [f(0), f(8), f(4)].map((x) => Math.round(x * 255).toString(16).padStart(2, "0")).join("");
};

/** Dark mapping of one Tailwind palette: tints become deep tinted surfaces over the card colour, strong text tones
 *  become light ones, mid tones stay. So `bg-red-50 text-red-800 border-red-300` reads as a dark callout. */
export function darkPalette(p: Palette, cardHex: string): Record<string, string> {
  return {
    "50": mix(p["900"], cardHex, 0.3),
    "100": mix(p["800"], cardHex, 0.42),
    "200": mix(p["700"], cardHex, 0.5),
    "300": mix(p["600"], cardHex, 0.62),
    "400": rgbTriple(p["400"]),
    "500": rgbTriple(p["500"]),
    "600": rgbTriple(p["400"]),
    "700": rgbTriple(p["300"]),
    "800": rgbTriple(p["200"]),
    "900": rgbTriple(p["100"]),
    "950": rgbTriple(p["50"]),
  };
}

/** Every theme's variables, keyed by selector, for Tailwind's addBase. The default theme also sits on :root. */
export function themeCss(palettes: Record<string, Palette>): Record<string, Record<string, string>> {
  const out: Record<string, Record<string, string>> = {};
  for (const t of THEME_LIST) {
    const v: Record<string, string> = {};
    for (const [k, val] of Object.entries(t.tokens)) v[`--${k}`] = val;
    for (const [k, hex] of Object.entries(t.brand)) v[`--brand-${k}`] = rgbTriple(hex);
    v["--radius"] = t.radius;
    v["--shadow-strength"] = String(t.shadowStrength);
    v["--font-heading"] = `var(${t.headingFont})`;
    v["color-scheme"] = t.dark ? "dark" : "light";
    const card = hslToHex(t.tokens.card);
    for (const name of REMAPPED_PALETTES) {
      const p = palettes[name];
      if (!p) continue;
      const dark = t.dark ? darkPalette(p, card) : null;
      // `initial` makes the variable invalid, so the var() fallback (Tailwind's own value) applies. Light themes say so
      // explicitly so a light preview nested inside a dark page is not tinted by the page's dark mapping.
      for (const s of PALETTE_STEPS) v[`--tw-${name}-${s}`] = dark ? dark[s] : "initial";
    }
    const sel = `[data-theme="${t.id}"]`;
    out[t.id === DEFAULT_THEME ? `:root, ${sel}` : sel] = v;
  }
  return out;
}

import type { Config } from "tailwindcss";

// Design tokens extracted from OKComputer_NRG_Website_v62/assets/index-*.css
// (see PROGRESS.md). Purple primary hsl(270 60% 35%) = #6b2d8b.
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
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        card: "hsl(var(--card))",
        "card-foreground": "hsl(var(--card-foreground))",
        popover: "hsl(var(--popover))",
        "popover-foreground": "hsl(var(--popover-foreground))",
        primary: "hsl(var(--primary))",
        "primary-foreground": "hsl(var(--primary-foreground))",
        secondary: "hsl(var(--secondary))",
        "secondary-foreground": "hsl(var(--secondary-foreground))",
        muted: "hsl(var(--muted))",
        "muted-foreground": "hsl(var(--muted-foreground))",
        accent: "hsl(var(--accent))",
        "accent-foreground": "hsl(var(--accent-foreground))",
        destructive: "hsl(var(--destructive))",
        "destructive-foreground": "hsl(var(--destructive-foreground))",
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        // Extended purple scale — values sampled from the reference build
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
        gold: "#fbbf24",
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      fontFamily: {
        sans: ["var(--font-inter)", "system-ui", "sans-serif"],
        heading: ["var(--font-poppins)", "var(--font-inter)", "sans-serif"],
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
  plugins: [],
};
export default config;

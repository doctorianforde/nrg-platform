import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { headers } from "next/headers";
import { UserProvider } from "@/lib/auth/UserProvider";
import { ThemeSync } from "@/components/theme/ThemeSync";
import { DEFAULT_THEME, THEME_HEADER, isThemeId } from "@/lib/theme/themes";

// Font stack matches the reference design (OKComputer_NRG_Website_v62):
// Inter for UI/body, Poppins for headings, Nunito Sans for brand accents. Student themes swap in their own pair.
// Self-hosted (src/app/fonts, latin subset, SIL Open Font License) rather than next/font/google: fetching from Google at
// build time failed a Vercel build on 2026-10-13, and a font download should never be able to break a deploy.
const inter = localFont({
  src: "./fonts/inter-latin.woff2",
  variable: "--font-inter",
  weight: "300 700",
  display: "swap",
});
const poppins = localFont({
  src: [
    { path: "./fonts/poppins-400-latin.woff2", weight: "400" },
    { path: "./fonts/poppins-500-latin.woff2", weight: "500" },
    { path: "./fonts/poppins-600-latin.woff2", weight: "600" },
    { path: "./fonts/poppins-700-latin.woff2", weight: "700" },
    { path: "./fonts/poppins-800-latin.woff2", weight: "800" },
  ],
  variable: "--font-poppins",
  display: "swap",
});
const nunito = localFont({
  src: "./fonts/nunito-sans-latin.woff2",
  variable: "--font-nunito",
  weight: "400 700",
  display: "swap",
});
// Theme-only faces (src/lib/theme/themes.ts): not preloaded, so only a student on that theme downloads them.
const nunitoRounded = localFont({
  src: "./fonts/nunito-latin.woff2",
  variable: "--font-nunito-rounded",
  weight: "300 900",
  display: "swap",
  preload: false,
});
const outfit = localFont({
  src: "./fonts/outfit-latin.woff2",
  variable: "--font-outfit",
  weight: "300 800",
  display: "swap",
  preload: false,
});
const atkinson = localFont({
  src: [
    { path: "./fonts/atkinson-400-latin.woff2", weight: "400" },
    { path: "./fonts/atkinson-700-latin.woff2", weight: "700" },
  ],
  variable: "--font-atkinson",
  display: "swap",
  preload: false,
});
const fraunces = localFont({
  src: "./fonts/fraunces-latin.woff2",
  variable: "--font-fraunces",
  weight: "300 800",
  display: "swap",
  preload: false,
});
const dmSans = localFont({
  src: "./fonts/dm-sans-latin.woff2",
  variable: "--font-dm-sans",
  weight: "300 800",
  display: "swap",
  preload: false,
});
const FONT_VARIABLES = [inter, poppins, nunito, nunitoRounded, outfit, atkinson, fraunces, dmSans]
  .map((f) => f.variable)
  .join(" ");

export const metadata: Metadata = {
  title: "NRG Platform",
  description: "RENR nursing exam preparation — practice, flashcards, case studies and mock exams.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // The middleware resolves the student's theme (study area only; everyone else gets the default) so it is in the
  // first HTML byte: no flash of the default theme. The font variables sit on <html> too, because each theme's
  // --font-heading refers to them from there.
  const requested = headers().get(THEME_HEADER);
  const theme = isThemeId(requested) ? requested : DEFAULT_THEME;
  return (
    <html
      lang="en"
      data-theme={theme}
      className={FONT_VARIABLES}
      suppressHydrationWarning
    >
      <body className="font-sans antialiased">
        <ThemeSync />
        <UserProvider>{children}</UserProvider>
      </body>
    </html>
  );
}

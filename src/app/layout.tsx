import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { UserProvider } from "@/lib/auth/UserProvider";

// Font stack matches the reference design (OKComputer_NRG_Website_v62):
// Inter for UI/body, Poppins for headings, Nunito Sans for brand accents.
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

export const metadata: Metadata = {
  title: "NRG Platform",
  description: "RENR nursing exam preparation — practice, flashcards, case studies and mock exams.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${inter.variable} ${poppins.variable} ${nunito.variable} font-sans antialiased`}
      >
        <UserProvider>{children}</UserProvider>
      </body>
    </html>
  );
}

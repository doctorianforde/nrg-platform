import type { Metadata } from "next";
import { Inter, Poppins, Nunito_Sans } from "next/font/google";
import "./globals.css";
import { UserProvider } from "@/lib/auth/UserProvider";

// Font stack matches the reference design (OKComputer_NRG_Website_v62):
// Inter for UI/body, Poppins for headings, Nunito Sans for brand accents.
const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  weight: ["300", "400", "500", "600", "700"],
});
const poppins = Poppins({
  subsets: ["latin"],
  variable: "--font-poppins",
  weight: ["400", "500", "600", "700", "800"],
});
const nunito = Nunito_Sans({
  subsets: ["latin"],
  variable: "--font-nunito",
  weight: ["400", "600", "700"],
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

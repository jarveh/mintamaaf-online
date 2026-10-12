import type { Metadata } from "next";
import { Instrument_Serif, Inter } from "next/font/google";
import { GoogleAnalytics } from "@next/third-parties/google";
import { SITE_URL } from "@/lib/config";
import "./globals.css";

const display = Instrument_Serif({
  subsets: ["latin"],
  weight: "400",
  style: ["normal", "italic"],
  variable: "--font-display",
});

const body = Inter({
  subsets: ["latin"],
  variable: "--font-body",
});

const title = "Mintamaaf — Make sorry a little more special";
const description =
  "Turn a heartfelt note into a beautiful, shareable apology page. Write your story, get a designed one-page site with a link that lasts seven days.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: title,
    template: "%s — Mintamaaf",
  },
  description,
  applicationName: "Mintamaaf",
  alternates: { canonical: "./" },
  openGraph: {
    type: "website",
    siteName: "Mintamaaf",
    locale: "en_US",
    title,
    description,
    url: "./",
    images: [{ url: "/og.png", width: 1200, height: 630, alt: title }],
  },
  twitter: {
    card: "summary_large_image",
    title,
    description,
    images: ["/og.png"],
  },
  robots: { index: true, follow: true },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const gaId = process.env.NEXT_PUBLIC_GA_ID;
  return (
    <html lang="en" className={`${display.variable} ${body.variable}`}>
      <body>{children}</body>
      {gaId ? <GoogleAnalytics gaId={gaId} /> : null}
    </html>
  );
}

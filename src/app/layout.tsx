import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Mintamaaf — Make sorry a little more special",
  description: "Turn a heartfelt note into a beautiful, shareable apology page.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en"><body>{children}</body></html>;
}

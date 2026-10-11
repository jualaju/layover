import type { Metadata } from "next";
import localFont from "next/font/local";
import "leaflet/dist/leaflet.css";
import "./globals.css";

const pixelFont = localFont({ src: "../public/fonts/PixelifySans.ttf", variable: "--font-pixel", display: "swap", weight: "400 700" });

export const metadata: Metadata = {
  title: "Rendezvous",
  description: "Find a fair place for everyone to meet.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={pixelFont.variable}>
      <body>{children}</body>
    </html>
  );
}

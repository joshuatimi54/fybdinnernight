import type { Metadata, Viewport } from "next";
import { Cormorant_Garamond, Italianno, Jost, IBM_Plex_Mono } from "next/font/google";
import { Toaster } from "sonner";
import "./globals.css";

const display = Cormorant_Garamond({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600"],
  variable: "--font-display-loaded",
  display: "swap",
});

const script = Italianno({
  subsets: ["latin"],
  weight: ["400"],
  variable: "--font-script-loaded",
  display: "swap",
});

const body = Jost({
  subsets: ["latin"],
  weight: ["300", "400", "500"],
  variable: "--font-body-loaded",
  display: "swap",
});

const mono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-mono-loaded",
  display: "swap",
});

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "FYB Dinner Night",
    template: "%s · FYB Dinner Night",
  },
  description:
    "No date, no dinner. Write someone a love note, find your date, and take your seat at the FYB Dinner Night.",
  openGraph: {
    title: "FYB Dinner Night",
    description: "No date, no dinner. Write a love note and find your date.",
    type: "website",
  },
};

export const viewport: Viewport = {
  themeColor: "#FBF8F2",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body
        className={`${display.variable} ${script.variable} ${body.variable} ${mono.variable}`}
      >
        {children}
        <Toaster
          position="top-center"
          toastOptions={{
            style: {
              background: "var(--paper)",
              border: "1px solid var(--rule-strong)",
              color: "var(--ink)",
              borderRadius: "0",
              fontFamily: "var(--f-body)",
              fontWeight: "300",
            },
          }}
        />
      </body>
    </html>
  );
}

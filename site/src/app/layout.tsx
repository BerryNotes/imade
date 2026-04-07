import type { Metadata } from "next";
import "./globals.css";
import { Analytics } from "@vercel/analytics/next";
import { SmoothScroll } from "@/components/smooth-scroll";
import { BackgroundEffects } from "@/components/background-effects";

export const metadata: Metadata = {
  metadataBase: new URL(
    "https://imade.one"
  ),
  title: "iMade — Know Your Strongest Work",
  description:
    "Music ranking tool for producers. Track your growth, find your strongest beats, and make intentional decisions about your music.",
  openGraph: {
    title: "iMade — Know Your Strongest Work",
    description:
      "Music ranking tool for producers. Track your growth, find your strongest beats, and make intentional decisions about your music.",
    type: "website",
    images: [
      {
        url: "/og-image.png",
        width: 2422,
        height: 1442,
        alt: "iMade — Music ranking tool for producers",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "iMade — Know Your Strongest Work",
    description:
      "Music ranking tool for producers. Track your growth, find your strongest beats, and make intentional decisions about your music.",
    images: ["/og-image.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <Analytics />
        <BackgroundEffects />
        <SmoothScroll>{children}</SmoothScroll>
      </body>
    </html>
  );
}

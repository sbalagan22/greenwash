import type { Metadata } from "next";
import { DM_Sans, DM_Mono, Syne } from "next/font/google";
import { TooltipProvider } from "@/components/ui/tooltip";
import "./globals.css";

const dmSans = DM_Sans({
  variable: "--font-dm-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

const dmMono = DM_Mono({
  variable: "--font-dm-mono",
  subsets: ["latin"],
  weight: ["400"],
});

const syne = Syne({
  variable: "--font-syne",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
});

export const metadata: Metadata = {
  title: "greenwash",
  description:
    "Upload any corporate sustainability report. greenwash uses AI to extract claims, cross-reference them against public data, and grade their credibility.",
  openGraph: {
    title: "greenwash — We Read the Fine Print",
    description:
      "AI-powered audit of corporate sustainability claims. Every claim extracted, every source cited.",
    type: "website",
  },
  icons: {
    icon: "/fav_icon.png",
    apple: "/apple-icon.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${dmSans.variable} ${dmMono.variable} ${syne.variable} antialiased font-body`}
      >
        <TooltipProvider>{children}</TooltipProvider>
      </body>
    </html>
  );
}

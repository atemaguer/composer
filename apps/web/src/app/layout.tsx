import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { siteConfig } from "@/lib/site";

const cursorGothic = localFont({
  variable: "--font-cursor-gothic",
  fallback: ["system-ui", "Helvetica Neue", "Helvetica", "Arial", "sans-serif"],
  src: [
    {
      path: "../../../desktop/src/assets/fonts/CursorGothic-Regular.woff2",
      weight: "400",
      style: "normal",
    },
    {
      path: "../../../desktop/src/assets/fonts/CursorGothic-Italic.woff2",
      weight: "400",
      style: "italic",
    },
    {
      path: "../../../desktop/src/assets/fonts/CursorGothic-Bold.woff2",
      weight: "700",
      style: "normal",
    },
    {
      path: "../../../desktop/src/assets/fonts/CursorGothic-BoldItalic.woff2",
      weight: "700",
      style: "italic",
    },
  ],
});

export const metadata: Metadata = {
  metadataBase: new URL(siteConfig.url),
  title: {
    default: siteConfig.title,
    template: `%s · ${siteConfig.name}`,
  },
  description: siteConfig.description,
  applicationName: siteConfig.name,
  keywords: [
    "Composer",
    "Claude Code",
    "Codex",
    "coding agent",
    "agent handoff",
    "multi-agent",
    "AI pair programming",
    "developer tools",
  ],
  authors: [{ name: "Composer" }],
  creator: "Composer",
  alternates: {
    canonical: "/",
  },
  openGraph: {
    type: "website",
    siteName: siteConfig.name,
    title: siteConfig.title,
    description: siteConfig.description,
    url: siteConfig.url,
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: siteConfig.title,
    description: siteConfig.description,
    creator: siteConfig.twitter,
  },
  icons: {
    icon: "/composer-icon.png",
    apple: "/composer-icon.png",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
};

export const viewport: Viewport = {
  themeColor: "#0c0b09",
  colorScheme: "dark",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${cursorGothic.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}

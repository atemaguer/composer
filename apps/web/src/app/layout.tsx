import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";

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
  title: "Composer | Agent-native desktop workspace",
  description:
    "Composer is a focused desktop workspace for steering coding agents through real project work.",
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

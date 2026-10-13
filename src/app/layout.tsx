import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { TopNav } from "./nav";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Dkn Stock Research",
  description: "Personal swing-trading research for NSE/BSE equities",
  other: { "color-scheme": "only light" },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col bg-[#f7f7f8] text-zinc-900">
        <TopNav />
        <div className="flex-1">{children}</div>
        <footer className="mt-12 border-t border-zinc-200 bg-white">
          <div className="mx-auto max-w-6xl px-4 py-4 text-xs text-zinc-400">
            Personal research tool · end-of-day data only · not investment
            advice · no orders are placed anywhere
          </div>
        </footer>
      </body>
    </html>
  );
}

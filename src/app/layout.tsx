import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { TopNav } from "./nav";
import { APP_NAME, APP_TAGLINE, LogoMark } from "./brand";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: { default: `${APP_NAME} · ${APP_TAGLINE}`, template: `%s · ${APP_NAME}` },
  description:
    "Personal swing-trading research for NSE/BSE equities: end-of-day analysis, knowledge base from trading courses, planner, backtests and paper trading.",
  applicationName: APP_NAME,
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
          <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-3 gap-y-1 px-4 py-4 text-xs text-zinc-400">
            <span className="flex items-center gap-1.5 font-medium text-zinc-500">
              <LogoMark size={16} /> {APP_NAME}
            </span>
            <span>
              Personal research tool · end-of-day data only · not investment
              advice · no orders are placed anywhere
            </span>
          </div>
        </footer>
      </body>
    </html>
  );
}

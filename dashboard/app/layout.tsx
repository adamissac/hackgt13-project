import type { Metadata, Viewport } from "next";

import ThemeToggle from "@/components/ThemeToggle";
import { THEME_INIT_SCRIPT } from "@/lib/theme";

import "./globals.css";

export const metadata: Metadata = {
  title: "Formal Connection",
  description: "Connection Graph and event community map for HackGT 13",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Applies the saved theme before first paint, so a dark-mode user never sees a white
            flash. Must be inline and synchronous here - a bundled module runs too late.
            suppressHydrationWarning above: this script sets data-theme on <html>, which the
            server did not render. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body>
        {children}
        <ThemeToggle />
      </body>
    </html>
  );
}

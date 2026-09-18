import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { ThemeProvider, themeScript } from "@/components/theme-provider";
import { MotionPreferences } from "@/components/motion-preferences";
import { SessionProvider } from "@/components/session-provider";
import { ToastProvider } from "@/components/ui/toast";
import { NetworkProvider } from "@/components/network-provider";
import { BRAND } from "@/lib/brand";

/**
 * §2.3 typography — Inter + JetBrains Mono, self-hosted.
 *
 * The files in ./fonts are the SIL OFL 1.1 releases of both families
 * (licences committed alongside them), subset to the ranges below. They are
 * served from our own origin, so:
 *   - no request to a third-party font CDN (no privacy exposure, and the
 *     build no longer depends on fonts.googleapis.com being reachable);
 *   - next/font locally derives the fallback metrics, which removes the
 *     layout shift the system-font fallback used to cause on first paint.
 *
 * The Latin-Extended subset is declared as a second family rather than a
 * second @font-face for the same one: next/font cannot express
 * unicode-range, and two faces with identical family/weight/style would
 * make the last declaration win outright. As a family further down the
 * stack it is only fetched when a glyph actually needs it (preload: false).
 */
const inter = localFont({
  src: "./fonts/inter-latin-wght-normal.woff2",
  variable: "--font-inter",
  weight: "100 900",
  style: "normal",
  display: "swap",
  preload: true,
});

const interExt = localFont({
  src: "./fonts/inter-latin-ext-wght-normal.woff2",
  variable: "--font-inter-ext",
  weight: "100 900",
  style: "normal",
  display: "swap",
  preload: false,
});

const jetbrainsMono = localFont({
  src: "./fonts/jetbrains-mono-latin-wght-normal.woff2",
  variable: "--font-jetbrains-mono",
  weight: "100 800",
  style: "normal",
  display: "swap",
  preload: true,
});

export const metadata: Metadata = {
  title: {
    default: `${BRAND.name} — ${BRAND.tagline}`,
    template: `%s · ${BRAND.name}`,
  },
  description: BRAND.description,
  applicationName: BRAND.name,
  openGraph: {
    title: `${BRAND.name} — ${BRAND.tagline}`,
    description: BRAND.shortDescription,
    type: "website",
    siteName: BRAND.name,
  },
  twitter: {
    card: "summary_large_image",
    title: `${BRAND.name} — ${BRAND.tagline}`,
    description: BRAND.shortDescription,
  },
};

/**
 * Browser chrome colour per scheme. Matched to `--bg-app` rather than to the
 * brand accent, because the top of every page is the app background — a purple
 * mobile bar sitting above an off-white page reads as a rendering bug.
 */
export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f8fafa" },
    { media: "(prefers-color-scheme: dark)", color: "#080a0c" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // The font variables go on <html>, not <body>: globals.css declares
    // `--font-sans: var(--font-inter), …` inside its `@theme`, which Tailwind
    // emits on `:root`. A custom property that references another one defined
    // only on a descendant cannot resolve at `:root` — it becomes invalid at
    // computed-value time, and that invalid value is what inherits down. So
    // `--font-sans` resolved to nothing and the whole app silently fell back
    // to a system stack. Same element, same scope, resolves.
    <html
      lang="en"
      suppressHydrationWarning
      className={`${inter.variable} ${interExt.variable} ${jetbrainsMono.variable}`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="antialiased">
        <ThemeProvider>
          <NetworkProvider>
            <ToastProvider>
              <MotionPreferences>
                <SessionProvider>{children}</SessionProvider>
              </MotionPreferences>
            </ToastProvider>
          </NetworkProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}

/**
 * TL-EXPERIENCE-SHELL-001 — Root layout
 *
 * The application shell. Every page inherits its language, direction, theme,
 * skip link and metadata from here.
 *
 * `lang` and `dir` are set from the locale rather than hard-coded, because they
 * are not cosmetic: `lang` tells a screen reader which pronunciation rules to
 * use, and `dir` mirrors the entire layout for RTL languages. Hard-coding
 * `lang="en" dir="ltr"` is the single line that makes a "global" product
 * un-global (Constitution §4).
 */

import type { Metadata, Viewport } from 'next';
import { Manrope } from 'next/font/google';
import Script from 'next/script';
import { headers } from 'next/headers';
import { DEFAULT_LOCALE } from '@/registry/globalization';
import { getDirection } from '@/platform/i18n';
import { THEME_SCRIPT } from '@/design-system';
import { ServiceWorkerRegistration } from '@/components/pwa/service-worker';
import './globals.css';

/*
 * The product typeface.
 *
 * `--tl-font-sans` in globals.css has always referenced `--font-tl-sans`; until
 * now nothing defined it, so every screen silently fell back to system-ui. This
 * wires it up.
 *
 * Manrope is a geometric sans with a wide range of weights, which is what the
 * wordmark needs — "tooth" at 700 beside "logy" at 300 only works if both come
 * from one family. `next/font` self-hosts it: no request to Google at runtime,
 * no third-party font call from a health platform's pages, and `display: swap`
 * with an explicit fallback so text is readable during the swap rather than
 * invisible.
 */
const sans = Manrope({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-tl-sans',
  // The weights the design system actually uses. Loading the full range would
  // ship several files nothing references.
  weight: ['300', '400', '500', '600', '700'],
  fallback: ['system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
});

export const metadata: Metadata = {
  // Resolves relative canonical, Open Graph and Twitter URLs against the
  // configured public origin, so no page hard-codes a hostname.
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'),
  title: {
    default: 'Toothlogy',
    template: '%s · Toothlogy',
  },
  openGraph: {
    siteName: 'Toothlogy',
    type: 'website',
    locale: 'en_IN',
  },
  twitter: { card: 'summary' },
  description:
    'Toothlogy is a global dental ecosystem connecting patients, dentists, clinics, colleges, students and suppliers.',
  applicationName: 'Toothlogy',
  // Drives the icon on iOS home screens and the theme colour of the browser
  // chrome on Android. Both resolve from src/app/icon.svg.
  appleWebApp: { title: 'Toothlogy' },
  // Phase 0 has no public content worth indexing. Made explicit rather than
  // left to a default, so the decision is deliberate and easy to reverse.
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  // `maximumScale` is deliberately not set: capping zoom locks out users who
  // need to magnify text, and is an accessibility failure under WCAG 1.4.4.
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#fbfcfc' },
    { media: '(prefers-color-scheme: dark)', color: '#071319' },
  ],
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = DEFAULT_LOCALE;
  // The request proxy's per-request CSP nonce (src/proxy.ts). Reading it makes
  // every page render per request, which a nonce requires.
  const nonce = (await headers()).get('x-nonce') ?? undefined;

  return (
    <html
      lang={locale}
      dir={getDirection(locale)}
      className={sans.variable}
      // Next 16 no longer overrides smooth scrolling during route changes on
      // its own; this attribute asks it to, so navigation jumps to the top
      // instantly while in-page anchor links still scroll smoothly.
      data-scroll-behavior="smooth"
      suppressHydrationWarning
    >
      <body>
        {/*
         * Applies the stored theme, palette, contrast, motion and text size
         * before first paint, preventing a flash of the wrong theme. Injected
         * into <head> by Next.js as part of the server HTML
         * (`beforeInteractive`), which is where an inline script actually runs:
         * a raw <script> rendered by a React component is never executed on
         * the client and React warns about it on every render.
         * See design-system/components/theme-script.ts.
         */}
        <Script id="tl-theme" strategy="beforeInteractive" nonce={nonce} dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
        {/*
         * The skip link targets #main, which each route group's layout provides
         * on its <main> element. Without it, a keyboard or screen-reader user
         * tabs through the entire navigation on every single page.
         */}
        <a className="tl-skip-link" href="#main">
          Skip to main content
        </a>
        {children}
        <ServiceWorkerRegistration />
      </body>
    </html>
  );
}

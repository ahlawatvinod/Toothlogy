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
import { DEFAULT_LOCALE } from '@/registry/globalization';
import { getDirection } from '@/platform/i18n';
import { THEME_SCRIPT } from '@/design-system';
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
  title: {
    default: 'Toothlogy',
    template: '%s · Toothlogy',
  },
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

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = DEFAULT_LOCALE;

  return (
    <html
      lang={locale}
      dir={getDirection(locale)}
      className={sans.variable}
      suppressHydrationWarning
    >
      <head>
        {/*
         * Runs before first paint to apply the stored theme, preventing a flash
         * of the wrong theme. It must be inline and synchronous, so it cannot
         * come from a bundle. See design-system/components/theme-script.ts.
         */}
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body>
        {/*
         * Framer Motion writes its `initial` state into the server-rendered
         * HTML — `opacity: 0` on the header bar, the hero image and its cards —
         * and then animates it away on mount. With scripting off nothing ever
         * mounts, so without this those elements stay invisible for good.
         *
         * `Reveal` solves the same problem by scoping its hidden state to
         * `.tl-js`; a library that inlines styles cannot be scoped that way, so
         * the guard has to outrank the inline style instead.
         */}
        <noscript>
          <style>{
            '.tl-header__inner,.tl-showcase,.tl-float,.tl-float__tooth' +
            '{opacity:1!important;transform:none!important}'
          }</style>
        </noscript>

        {/*
         * The skip link targets #main, which each route group's layout provides
         * on its <main> element. Without it, a keyboard or screen-reader user
         * tabs through the entire navigation on every single page.
         */}
        <a className="tl-skip-link" href="#main">
          Skip to main content
        </a>
        {children}
      </body>
    </html>
  );
}

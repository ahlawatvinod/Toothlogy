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
import { DEFAULT_LOCALE } from '@/registry/globalization';
import { getDirection } from '@/platform/i18n';
import { THEME_SCRIPT } from '@/design-system';
import './globals.css';

export const metadata: Metadata = {
  title: {
    default: 'Toothlogy',
    template: '%s · Toothlogy',
  },
  description:
    'Toothlogy is a global dental ecosystem connecting patients, dentists, clinics, colleges, students and suppliers.',
  applicationName: 'Toothlogy',
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
    { media: '(prefers-color-scheme: dark)', color: '#0b1413' },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = DEFAULT_LOCALE;

  return (
    <html lang={locale} dir={getDirection(locale)} suppressHydrationWarning>
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

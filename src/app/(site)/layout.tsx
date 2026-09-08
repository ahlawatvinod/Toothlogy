/**
 * Public site layout: header, main landmark, footer.
 *
 * A route group, so `(site)` adds no URL segment — the home page stays at `/`.
 * Grouping exists to give public pages a shell that the focused auth flow
 * deliberately does not share.
 *
 * `<main id="main">` is the target of the skip link in the root layout, which is
 * how a keyboard user bypasses the navigation on every page.
 */

import type { ReactNode } from 'react';
import { SiteFooter } from '@/components/shell/site-footer';
import { SiteHeader } from '@/components/shell/site-header';

export default function SiteLayout({ children }: { children: ReactNode }) {
  return (
    <div className="tl-layout">
      <SiteHeader />
      <main id="main" className="tl-layout__main">
        {children}
      </main>
      <SiteFooter />
    </div>
  );
}

/**
 * Authenticated application layout.
 *
 * Enforces authentication ON THE SERVER, before any child renders. A
 * client-side redirect would mean the page and its data were already sent to an
 * unauthenticated browser — the check would be cosmetic.
 *
 * The `next` parameter carries the requested path so the user lands where they
 * were going after signing in, rather than being dumped on a dashboard and
 * having to navigate again.
 */

import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { currentPrincipal } from '@/platform/auth/server';
import { isAuthenticated } from '@/platform/rbac';
import { SiteFooter } from '@/components/shell/site-footer';
import { SiteHeader } from '@/components/shell/site-header';

export default async function AppLayout({ children }: { children: ReactNode }) {
  const principal = await currentPrincipal();

  if (!isAuthenticated(principal)) {
    // Next.js sets this header on every request it routes; it is the only way
    // for a layout to know the path it is rendering for.
    const requested = (await headers()).get('x-invoke-path') ?? '/account';
    redirect(`/login?next=${encodeURIComponent(requested)}`);
  }

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

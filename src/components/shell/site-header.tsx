/**
 * Site header.
 *
 * A server component, so the signed-in state is resolved before the page is
 * sent. Rendering a signed-out header and correcting it after hydration would
 * flash "Sign in" at an authenticated user on every navigation — and would leak
 * a moment where the UI and the session disagree.
 *
 * The scroll, mobile-menu and active-link behaviour lives in `SiteNav`, which is
 * a client component. This file stays the only place that touches the session,
 * and passes the already-decided action buttons down as props — so adding
 * interactivity to the header did not move authentication to the client.
 */

import Link from 'next/link';
import { currentPrincipal } from '@/platform/auth/server';
import { isAuthenticated } from '@/platform/rbac';
import { ThemeToggle } from '@/design-system';
import { Logo } from '@/components/brand/logo';
import { SignOutButton } from './sign-out-button';
import { SiteNav, type NavLink } from './site-nav';

/**
 * Single source of truth for the primary navigation. The header and the mobile
 * menu render from the same array, so the two cannot drift — the failure mode
 * being a link that exists on desktop and silently does not on a phone.
 */
const NAV_LINKS: readonly NavLink[] = [
  { href: '/find', label: 'Find a dentist' },
  { href: '/knowledge', label: 'Learn' },
  { href: '/for-dentists', label: 'For dentists' },
];

export async function SiteHeader() {
  const principal = await currentPrincipal();
  const signedIn = isAuthenticated(principal);

  const brand = (
    <Link href="/" className="tl-header__brand" aria-label="Toothlogy home">
      <Logo />
    </Link>
  );

  return (
    <SiteNav
      links={NAV_LINKS}
      brand={brand}
      actions={
        <>
          <ThemeToggle />
          {signedIn ? (
            <>
              <Link className="tl-button tl-button--ghost tl-button--sm" href="/account">
                Account
              </Link>
              <SignOutButton />
            </>
          ) : (
            <>
              <Link className="tl-button tl-button--ghost tl-button--sm" href="/login">
                Sign in
              </Link>
              <Link className="tl-button tl-button--gradient tl-button--sm" href="/register">
                Create account
              </Link>
            </>
          )}
        </>
      }
      menuActions={
        signedIn ? (
          <>
            <Link className="tl-button tl-button--secondary tl-button--md" href="/account">
              Account
            </Link>
            <SignOutButton size="md" variant="ghost" fullWidth />
          </>
        ) : (
          <>
            <Link className="tl-button tl-button--secondary tl-button--md" href="/login">
              Sign in
            </Link>
            <Link className="tl-button tl-button--primary tl-button--md" href="/register">
              Create account
            </Link>
          </>
        )
      }
      menuMeta={
        <>
          <span className="tl-muted" style={{ fontSize: 'var(--tl-text-sm)' }}>
            Appearance
          </span>
          <ThemeToggle />
        </>
      }
    />
  );
}

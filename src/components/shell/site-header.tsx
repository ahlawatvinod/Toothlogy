/**
 * Site header.
 *
 * A server component, so the signed-in state is resolved before the page is
 * sent. Rendering a signed-out header and correcting it after hydration would
 * flash "Sign in" at an authenticated user on every navigation — and would leak
 * a moment where the UI and the session disagree.
 */

import Link from 'next/link';
import { currentPrincipal } from '@/platform/auth/server';
import { isAuthenticated } from '@/platform/rbac';
import { ThemeToggle } from '@/design-system';
import { SignOutButton } from './sign-out-button';

export async function SiteHeader() {
  const principal = await currentPrincipal();
  const signedIn = isAuthenticated(principal);

  return (
    <header className="tl-header">
      <div className="tl-container tl-header__inner">
        <Link href="/" className="tl-header__brand" aria-label="Toothlogy home">
          <span className="tl-header__mark" aria-hidden="true">
            T
          </span>
          <span>Toothlogy</span>
        </Link>

        {/*
         * A real <nav> with an accessible name. A screen-reader user can jump
         * straight to it, and with several nav landmarks on a page the name is
         * what distinguishes them.
         */}
        <nav className="tl-header__nav" aria-label="Main">
          <Link href="/find">Find a dentist</Link>
          <Link href="/knowledge">Learn</Link>
          <Link href="/for-dentists">For dentists</Link>
        </nav>

        <div className="tl-header__actions">
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
              <Link className="tl-button tl-button--primary tl-button--sm" href="/register">
                Create account
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}

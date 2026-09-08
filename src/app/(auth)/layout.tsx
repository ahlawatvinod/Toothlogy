/**
 * Auth layout.
 *
 * A route group `(auth)`, so these pages share a layout without adding an
 * `/auth` segment to the URL — `/login` reads better than `/auth/login` and is
 * what users type.
 *
 * Deliberately narrow and free of navigation: sign-in and registration are
 * focused tasks, and a full header invites the user to wander off mid-flow.
 */

import Link from 'next/link';
import type { ReactNode } from 'react';

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="tl-auth">
      <div className="tl-auth__panel">
        <Link href="/" className="tl-auth__brand">
          <span className="tl-header__mark" aria-hidden="true">
            T
          </span>
          <span>Toothlogy</span>
        </Link>
        {children}
      </div>
    </div>
  );
}

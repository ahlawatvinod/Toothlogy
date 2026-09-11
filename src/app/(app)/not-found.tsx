/**
 * 404 inside the signed-in area — what a non-member sees for another
 * organization's pages, or anyone for a record they have no grant to.
 *
 * Rendered inside this group's layout, so the header and navigation stay and
 * only the page content is replaced, with the real 404 status and a real <h1>
 * so the page announces what happened like every other page does. (The
 * development-only "Encountered a script tag" console warning still appears
 * here; see Known limitations in docs/BUILD-STATUS.md.)
 */

import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="tl-page">
      <header className="tl-page__header">
        <h1>Page not found</h1>
        <p className="tl-page__lead">It does not exist, or it is not shared with you.</p>
      </header>
      <div>
        <Link className="tl-button tl-button--secondary tl-button--md" href="/account">
          Go to your account
        </Link>
      </div>
    </div>
  );
}

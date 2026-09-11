/**
 * 404 inside the signed-in area — what a non-member sees for another
 * organization's pages, or anyone for a record they have no grant to.
 *
 * Rendered inside this group's layout, so the header and navigation stay and
 * only the page content is replaced. (Falling through to the root not-found
 * re-rendered the root layout on the client, and with it the pre-paint theme
 * script — the development "Encountered a script tag" warning.) A real <h1>,
 * so the page announces what happened like every other page does.
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

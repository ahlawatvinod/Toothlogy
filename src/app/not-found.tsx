/**
 * 404 page for addresses that match no route at all.
 *
 * A 404 is a navigational dead end, so it always offers a way onward. An empty
 * "Not found" is the most common place users abandon a site entirely. A real
 * <h1>, so screen readers announce what happened. (Pages inside the site and
 * the account area have their own 404s, rendered within their layouts.)
 */

import Link from 'next/link';

export const metadata = {
  title: 'Page not found',
  robots: { index: false, follow: false },
};

export default function NotFound() {
  return (
    <main id="main" className="tl-container tl-page" style={{ paddingBlock: 'var(--tl-space-8)' }}>
      <header className="tl-page__header">
        <h1>Page not found</h1>
        <p className="tl-page__lead">The page you are looking for does not exist, or has moved.</p>
      </header>
      <div>
        <Link className="tl-button tl-button--secondary tl-button--md" href="/">
          Go to the home page
        </Link>
      </div>
    </main>
  );
}

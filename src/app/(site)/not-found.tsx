/**
 * 404 inside the public site — an unknown dentist, clinic, article or posting.
 * Rendered inside this group's layout, so the site header and footer stay and
 * the visitor has somewhere to go next. A real <h1>, like every other page.
 */

import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="tl-container tl-page">
      <header className="tl-page__header">
        <h1>Page not found</h1>
        <p className="tl-page__lead">The page you are looking for does not exist, or has moved.</p>
      </header>
      <div>
        <Link className="tl-button tl-button--secondary tl-button--md" href="/find">
          Find a dentist
        </Link>
      </div>
    </div>
  );
}

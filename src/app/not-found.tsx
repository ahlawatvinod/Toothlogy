/**
 * 404 page.
 *
 * A 404 is a navigational dead end, so it always offers a way onward. An empty
 * "Not found" is the most common place users abandon a site entirely.
 */

import Link from 'next/link';
import { EmptyState } from '@/design-system';

export const metadata = {
  title: 'Page not found',
  robots: { index: false, follow: false },
};

export default function NotFound() {
  return (
    <main className="tl-container" style={{ paddingBlock: 'var(--tl-space-8)' }}>
      <EmptyState
        title="Page not found"
        description="The page you are looking for does not exist, or has moved."
        action={
          <Link className="tl-button tl-button--secondary tl-button--md" href="/">
            Go to the home page
          </Link>
        }
      />
    </main>
  );
}

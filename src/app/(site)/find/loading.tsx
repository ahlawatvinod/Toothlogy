/**
 * Shown while a search runs (the next free time is checked for every result).
 *
 * Only here, not for whole route groups: a loading boundary lets Next stream
 * the page with status 200 before the page can decide it is a 404, which
 * turned every `notFound()` in the group into a "soft 404". `/find` never
 * answers not-found, so it can show progress safely.
 */

import { LoadingState } from '@/design-system';

export default function Loading() {
  return (
    <div className="tl-container tl-page" style={{ maxWidth: '60rem' }}>
      <LoadingState label="Searching…" />
    </div>
  );
}

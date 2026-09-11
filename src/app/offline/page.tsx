/**
 * TL-PAGE-OFFLINE-001 — /offline
 *
 * Shown by the service worker when a page cannot be reached. Static and free
 * of personal data by construction: it is cached on the device, and a cached
 * page must never contain anyone's appointments or records.
 */

import type { Metadata } from 'next';
import { RetryButton } from './retry-button';

export const metadata: Metadata = {
  title: 'You are offline',
  robots: { index: false, follow: false },
};

export default function OfflinePage() {
  return (
    <main id="main" className="tl-auth">
      <div className="tl-auth__panel" role="status">
        <h1 className="tl-auth__title">You are offline</h1>
        <p className="tl-auth__subtitle">
          Toothlogy needs a connection to show your appointments, messages and search results. Nothing
          you were doing has been lost — reconnect and try again.
        </p>
        <RetryButton />
      </div>
    </main>
  );
}

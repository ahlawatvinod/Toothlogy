'use client';

/**
 * Registers the service worker in production builds only.
 *
 * In development it actively UNREGISTERS any worker left over from a
 * production run on the same origin: a stale worker serving old hashed chunks
 * is the classic cause of an error that survives every rebuild.
 */

import { useEffect } from 'react';

export function ServiceWorkerRegistration() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

    if (process.env.NODE_ENV !== 'production') {
      void navigator.serviceWorker
        .getRegistrations()
        .then((registrations) => Promise.all(registrations.map((r) => r.unregister())));
      return;
    }

    void navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' }).catch(() => {
      // A failed registration leaves the site working exactly as a normal web
      // page; there is nothing for the user to do about it.
    });
  }, []);

  return null;
}

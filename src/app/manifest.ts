/**
 * TL-EXPERIENCE-PWA-001 — Web app manifest
 *
 * Makes Toothlogy installable to a home screen. The icons are PNGs rendered
 * from the brand mark by /pwa-icons/[size]; `maskable` variants carry the
 * mark inside the safe zone so Android's circular and squircle masks do not
 * crop the tooth.
 */

import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/',
    name: 'Toothlogy',
    short_name: 'Toothlogy',
    description:
      'Find verified dentists, book appointments and keep your dental journey in one place.',
    start_url: '/?source=pwa',
    scope: '/',
    display: 'standalone',
    background_color: '#fbfcfc',
    theme_color: '#0b7285',
    categories: ['health', 'medical', 'lifestyle'],
    icons: [
      { src: '/pwa-icons/192', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/pwa-icons/512', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/pwa-icons/maskable-512', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
    shortcuts: [
      { name: 'Find a dentist', url: '/find', description: 'Search verified dentists near you' },
      { name: 'My account', url: '/account' },
    ],
  };
}

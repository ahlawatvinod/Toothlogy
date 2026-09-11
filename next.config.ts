import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // The platform's own security headers are applied per API response by
  // defineRoute; these cover everything Next.js serves itself.
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          // Geolocation is allowed for our own origin only: the location picker
          // asks for it on a user gesture, and nothing embedded may.
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(self), geolocation=(self), payment=()' },
        ],
      },
      {
        // A service worker must never be served stale, or a broken worker
        // outlives the fix for it.
        source: '/sw.js',
        headers: [
          { key: 'Content-Type', value: 'application/javascript; charset=utf-8' },
          { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
          { key: 'Content-Security-Policy', value: "default-src 'self'; script-src 'self'" },
        ],
      },
    ];
  },
};

export default nextConfig;

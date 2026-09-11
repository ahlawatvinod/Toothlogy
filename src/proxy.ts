/**
 * TOOTHLOGY REQUEST PROXY — a Content Security Policy for every page
 *
 * Each HTML request gets a fresh nonce and a policy that lets only scripts
 * carrying it run. Next.js reads the nonce from the request's
 * `Content-Security-Policy` header and puts it on its own scripts; the root
 * layout reads `x-nonce` for Toothlogy's one inline script (the theme
 * bootstrap). API routes set their own security headers in defineRoute, and
 * static assets need none, so the matcher leaves them out — as it does
 * prefetches, whose HTML is never rendered.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { contentSecurityPolicy, STRICT_TRANSPORT_SECURITY } from '@/platform/http/csp';

export function proxy(request: NextRequest) {
  const isProduction = process.env.NODE_ENV === 'production';
  const nonce = btoa(crypto.randomUUID());
  const policy = contentSecurityPolicy(isProduction, nonce);
  const headers = new Headers(request.headers);
  headers.set('x-nonce', nonce);
  headers.set('Content-Security-Policy', policy);
  const response = NextResponse.next({ request: { headers } });
  response.headers.set('Content-Security-Policy', policy);
  // Pages carry HSTS too, not only API responses: the first page load is the
  // request a downgrade attack targets.
  if (isProduction) response.headers.set('Strict-Transport-Security', STRICT_TRANSPORT_SECURITY);
  return response;
}

export const config = {
  matcher: [
    {
      // Everything under /_next (assets, images, the dev server's hot-reload
      // socket) and the API are left alone; only pages get the policy.
      source: '/((?!api/|_next/|favicon.ico|icon|apple-icon|manifest.webmanifest|sw.js|robots.txt|sitemap.xml).*)',
      missing: [
        { type: 'header', key: 'next-router-prefetch' },
        { type: 'header', key: 'purpose', value: 'prefetch' },
      ],
    },
  ],
};

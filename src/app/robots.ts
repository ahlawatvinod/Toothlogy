/**
 * robots.txt
 *
 * Public discovery pages are crawlable; everything personal, administrative,
 * token-bearing or machine-facing is not. Disallowing is belt-and-braces:
 * those pages also send `noindex`, and personal pages require a session.
 */

import type { MetadataRoute } from 'next';
import { getPublicConfig } from '@/platform/config';

export default function robots(): MetadataRoute.Robots {
  const base = getPublicConfig().NEXT_PUBLIC_APP_URL.replace(/\/$/, '');
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: [
          '/account',
          '/admin',
          '/api/',
          '/invitations',
          '/verify',
          '/reset-password',
          '/offline',
          '/design-system',
        ],
      },
    ],
    sitemap: `${base}/sitemap.xml`,
    host: base,
  };
}

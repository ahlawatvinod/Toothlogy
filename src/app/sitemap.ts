/**
 * sitemap.xml
 *
 * Built from two sources of truth, never a hand-kept list:
 * - the page registry's `indexable` flag, for static public pages;
 * - discoverable dentists (verified, with a confirmed locatable practice).
 *
 * An unverified dentist never appears here, for the same reason they never
 * appear in search: listing them would present an unchecked professional as
 * part of Toothlogy's directory.
 */

import type { MetadataRoute } from 'next';
import { PAGES } from '@/registry/surfaces';
import { getPublicConfig, hasDatabase } from '@/platform/config';
import { db } from '@/platform/db/client';
import { logger } from '@/platform/observability/logger';

/** Regenerated hourly; a newly verified dentist appears within the hour. */
export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = getPublicConfig().NEXT_PUBLIC_APP_URL.replace(/\/$/, '');

  const staticEntries: MetadataRoute.Sitemap = PAGES.filter(
    (p) => p.indexable && p.audience === 'anonymous' && p.status === 'implemented' && !p.route.includes(':'),
  ).map((p) => ({
    url: `${base}${p.route === '/' ? '' : p.route}`,
    changeFrequency: p.route === '/' ? 'weekly' : 'monthly',
    priority: p.route === '/' ? 1 : 0.5,
  }));

  if (!hasDatabase()) return staticEntries;

  try {
    const now = new Date();
    const [dentists, clinics, articles, postings] = await Promise.all([
      db().dentistProfile.findMany({
        where: { isDiscoverable: true, deletedAt: null },
        select: { slug: true, updatedAt: true },
        orderBy: { updatedAt: 'desc' },
        take: 40_000, // with clinics, below the 50,000-URL limit of one sitemap file
      }),
      // Only verified clinics are indexable (their pages say noindex otherwise),
      // so only they belong in the sitemap.
      db().organization.findMany({
        where: {
          deletedAt: null,
          status: { in: ['ACTIVE', 'PENDING'] },
          verifiedAt: { not: null },
          OR: [{ verificationExpires: null }, { verificationExpires: { gt: now } }],
          locations: { some: { deletedAt: null, status: { not: 'PERMANENTLY_CLOSED' } } },
        },
        select: { slug: true, updatedAt: true },
        orderBy: { updatedAt: 'desc' },
        take: 9_000,
      }),
      // Reviewed, published knowledge articles (drafts and archived never).
      db().article.findMany({
        where: { liveTitle: { not: null }, status: { not: 'ARCHIVED' } },
        select: { slug: true, lastReviewedAt: true },
        orderBy: { lastReviewedAt: 'desc' },
        take: 900,
      }),
      // Open job and internship postings (closed ones leave the index).
      db().jobPosting.findMany({
        where: { status: 'OPEN', OR: [{ closesAt: null }, { closesAt: { gt: now } }], organization: { deletedAt: null } },
        select: { id: true, updatedAt: true },
        orderBy: { publishedAt: 'desc' },
        take: 900,
      }),
    ]);
    return [
      ...staticEntries,
      ...dentists.map((d) => ({
        url: `${base}/dentists/${d.slug}`,
        lastModified: d.updatedAt,
        changeFrequency: 'weekly' as const,
        priority: 0.8,
      })),
      ...clinics.map((c) => ({
        url: `${base}/clinics/${c.slug}`,
        lastModified: c.updatedAt,
        changeFrequency: 'weekly' as const,
        priority: 0.7,
      })),
      ...articles.map((a) => ({
        url: `${base}/knowledge/${a.slug}`,
        lastModified: a.lastReviewedAt ?? undefined,
        changeFrequency: 'monthly' as const,
        priority: 0.6,
      })),
      ...postings.map((p) => ({
        url: `${base}/careers/${p.id}`,
        lastModified: p.updatedAt,
        changeFrequency: 'daily' as const,
        priority: 0.5,
      })),
    ];
  } catch (error) {
    // A database blip must not turn the sitemap into an error page crawlers
    // cache; the static pages are still correct.
    logger.error('Sitemap could not load dentists', { error });
    return staticEntries;
  }
}

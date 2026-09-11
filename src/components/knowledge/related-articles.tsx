/**
 * Related reviewed articles under an article, each with the reason it is
 * shown. A fixed rule (same treatment, then field, then kind) — everyone sees
 * the same; nothing about the reader is used.
 */

import Link from 'next/link';
import { relatedArticles } from '@/platform/knowledge/service';
import { Card, CardBody, CardHeader } from '@/design-system';

export async function RelatedArticles({ slug }: { slug: string }) {
  const related = await relatedArticles(slug);
  if (related.length === 0) return null;
  return (
    <Card label="Related articles">
      <CardHeader>
        <strong>Related articles</strong>
      </CardHeader>
      <CardBody>
        <ul className="tl-list">
          {related.map((r) => (
            <li key={r.slug} className="tl-stack">
              <Link href={`/knowledge/${r.slug}`}>{r.title}</Link>
              <span className="tl-list__meta">
                {r.reason}
                {r.summary ? ` · ${r.summary.slice(0, 160)}${r.summary.length > 160 ? '…' : ''}` : ''}
              </span>
            </li>
          ))}
        </ul>
      </CardBody>
    </Card>
  );
}

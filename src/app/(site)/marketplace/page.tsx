/**
 * TL-PAGE-MARKETPLACE-001 — /marketplace
 *
 * Dental products and lab services from businesses that manage their own
 * listing, by category, district served and name or brand. Prices are the
 * seller's indicative figures; buyers ask for a quote on the seller's page.
 * Nothing is sold here while no payment provider is connected.
 */

import type { Metadata } from 'next';
import Link from 'next/link';
import { listPublicProducts } from '@/platform/marketplace/service';
import { BUSINESS_TYPE_LABEL, CATEGORY_BY_KEY, MARKETPLACE_CATEGORIES, isBusinessType } from '@/platform/catalogue/marketplace';
import { listDistricts } from '@/platform/india-data/districts';
import { formatMoney } from '@/platform/money';
import { Badge, Card, CardBody, EmptyState } from '@/design-system';

export const metadata: Metadata = {
  title: 'Dental marketplace',
  description: 'Dental consumables, instruments, equipment and laboratory services from suppliers, distributors and labs, with quotes on request.',
};
export const dynamic = 'force-dynamic';

export default async function MarketplacePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const category = typeof sp.category === 'string' && CATEGORY_BY_KEY.has(sp.category) ? sp.category : undefined;
  const districtId = typeof sp.district === 'string' && sp.district ? sp.district : undefined;
  const q = typeof sp.q === 'string' ? sp.q.slice(0, 80) : undefined;
  const [products, districts] = await Promise.all([listPublicProducts({ category, districtId, q }), listDistricts({ countryCode: 'IN' })]);
  const now = new Date();
  const href = (next: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ category, district: districtId, q, ...next })) if (v) p.set(k, v);
    const s = p.toString();
    return s ? `/marketplace?${s}` : '/marketplace';
  };

  return (
    <div className="tl-container tl-page">
      <header className="tl-page__header">
        <h1>Dental marketplace</h1>
        <p className="tl-page__lead">Supplies, equipment and lab work from dental businesses. Prices shown are the seller’s own and include GST; ask the seller for a quote. Payment and delivery are arranged with the seller.</p>
      </header>

      <form action="/marketplace" className="tl-inline" style={{ flexWrap: 'wrap', alignItems: 'flex-end' }} role="search">
        <label className="tl-field">
          <span className="tl-field__label">Name or brand</span>
          <input className="tl-input" type="search" name="q" defaultValue={q ?? ''} maxLength={80} />
        </label>
        <label className="tl-field">
          <span className="tl-field__label">Delivers to</span>
          <select className="tl-input" name="district" defaultValue={districtId ?? ''}>
            <option value="">Anywhere</option>
            {districts.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}, {d.state}
              </option>
            ))}
          </select>
        </label>
        {category ? <input type="hidden" name="category" value={category} /> : null}
        <button type="submit" className="tl-button tl-button--md tl-button--primary">
          <span>Search</span>
        </button>
      </form>

      <nav aria-label="Category" className="tl-inline" style={{ flexWrap: 'wrap' }}>
        <Link href={href({ category: undefined })} aria-current={!category ? 'page' : undefined} className={`tl-button tl-button--sm ${!category ? 'tl-button--secondary' : 'tl-button--ghost'}`}>
          <span>All</span>
        </Link>
        {MARKETPLACE_CATEGORIES.map((c) => (
          <Link key={c.key} href={href({ category: c.key })} aria-current={category === c.key ? 'page' : undefined} className={`tl-button tl-button--sm ${category === c.key ? 'tl-button--secondary' : 'tl-button--ghost'}`}>
            <span>{c.label}</span>
          </Link>
        ))}
      </nav>

      {products.length === 0 ? (
        <EmptyState title="Nothing listed here yet" description={category || districtId || q ? 'Nothing matches. Try another category or district.' : 'Businesses appear here once they publish their catalogue.'} />
      ) : (
        <ul className="tl-list" aria-label="Products and services">
          {products.map((p) => {
            const verified = p.organization.verifiedAt !== null && (p.organization.verificationExpires === null || p.organization.verificationExpires > now);
            return (
              <li key={p.id}>
                <Card label={p.name}>
                  <CardBody>
                    <div className="tl-stack">
                      <div className="tl-card__title-row">
                        <strong>{p.name}</strong>
                        <Badge tone="neutral">{CATEGORY_BY_KEY.get(p.category)?.label ?? p.category}</Badge>
                      </div>
                      <span className="tl-list__meta">
                        {p.brand ? `${p.brand} · ` : ''}
                        {p.priceMinor !== null && p.currency ? `${formatMoney({ amountMinor: p.priceMinor, currency: p.currency }, 'en-IN')}${p.unit ? ` per ${p.unit}` : ''} (indicative)` : 'Price on request'}
                        {p.minOrderQuantity > 1 ? ` · minimum ${p.minOrderQuantity}` : ''}
                      </span>
                      <span className="tl-list__meta">
                        <Link href={`/suppliers/${p.organization.slug}`}>{p.organization.name}</Link> · {isBusinessType(p.organization.type) ? BUSINESS_TYPE_LABEL[p.organization.type] : p.organization.type.toLowerCase()}
                        {verified ? ' · verified business' : ''}
                      </span>
                    </div>
                  </CardBody>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

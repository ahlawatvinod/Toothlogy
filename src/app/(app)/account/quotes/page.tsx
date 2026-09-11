/**
 * TL-PAGE-MY-QUOTES-001 — /account/quotes
 *
 * The buyer's quote requests: seller, item, quantity, the quote with its
 * validity, and accept or withdraw. Accepting agrees the price; payment and
 * delivery are arranged with the seller.
 */

import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { currentPrincipal } from '@/platform/auth/server';
import { isAuthenticated } from '@/platform/rbac';
import { myQuoteRequests, QUOTE_STATUS_LABEL } from '@/platform/marketplace/service';
import { formatMoney } from '@/platform/money';
import { Badge, Card, CardBody, EmptyState } from '@/design-system';
import { BuyerQuoteActions } from './buyer-quote-actions';

export const metadata: Metadata = { title: 'My quotes', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

export default async function MyQuotesPage() {
  const principal = await currentPrincipal();
  if (!isAuthenticated(principal)) redirect('/login?next=/account/quotes');
  const quotes = await myQuoteRequests(principal);
  const now = new Date();
  const when = (d: Date) => new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeZone: 'Asia/Kolkata' }).format(d);

  return (
    <div className="tl-page">
      <header className="tl-page__header">
        <h1>My quotes</h1>
        <p className="tl-page__lead">
          Quotes you asked dental businesses for. <Link href="/marketplace">Marketplace</Link>
        </p>
      </header>
      {quotes.length === 0 ? (
        <EmptyState title="No quote requests yet" description="Ask for a quote from a business’s page in the marketplace." />
      ) : (
        <ul className="tl-list" aria-label="Quote requests">
          {quotes.map((q) => {
            const expired = q.status === 'QUOTED' && q.validUntil !== null && q.validUntil <= now;
            return (
              <li key={q.id}>
                <Card label={`${q.product?.name ?? 'Request'} from ${q.seller.name}`}>
                  <CardBody>
                    <div className="tl-stack">
                      <div className="tl-card__title-row">
                        <strong>
                          {q.quantity} × {q.product?.name ?? 'item'}
                        </strong>
                        <Badge tone={q.status === 'QUOTED' && !expired ? 'info' : q.status === 'ACCEPTED' || q.status === 'CLOSED' ? 'success' : 'neutral'}>{expired ? 'Quote expired' : QUOTE_STATUS_LABEL[q.status]}</Badge>
                      </div>
                      <span className="tl-list__meta">
                        <Link href={`/suppliers/${q.seller.slug}`}>{q.seller.name}</Link> · asked {when(q.createdAt)}
                      </span>
                      {q.quotedPriceMinor !== null && q.currency ? (
                        <span>
                          Quote: <strong>{formatMoney({ amountMinor: q.quotedPriceMinor, currency: q.currency }, 'en-IN')}</strong> in all, GST included
                          {q.validUntil ? `, valid until ${when(q.validUntil)}` : ''}
                          {q.sellerNote ? ` — “${q.sellerNote}”` : ''}
                        </span>
                      ) : q.sellerNote ? (
                        <span className="tl-list__meta">Seller: “{q.sellerNote}”</span>
                      ) : null}
                      {q.status === 'ACCEPTED' || q.status === 'CLOSED' ? (
                        <span className="tl-list__meta">
                          Arrange payment and delivery with {q.seller.name}
                          {q.seller.phone ? ` — ${q.seller.phone}` : ''}
                          {q.seller.email ? ` · ${q.seller.email}` : ''}.
                        </span>
                      ) : null}
                      {(q.status === 'NEW' || q.status === 'QUOTED') && !expired ? <BuyerQuoteActions quoteRequestId={q.id} canAccept={q.status === 'QUOTED'} /> : null}
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

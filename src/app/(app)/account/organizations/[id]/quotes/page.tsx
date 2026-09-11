/**
 * TL-PAGE-ORG-QUOTES-001 — /account/organizations/:id/quotes
 *
 * A business's quote requests: numbers, each request with the buyer's
 * details, the item and quantity, history, and quote / decline / close.
 * Members who may read quotes see it; administrators act. 404 otherwise.
 */

import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { QuoteStatus } from '@prisma/client';
import { currentPrincipal } from '@/platform/auth/server';
import { can, isAuthenticated } from '@/platform/rbac';
import { db } from '@/platform/db/client';
import { listSellerQuotes, QUOTE_STATUS_LABEL, sellerQuoteStats } from '@/platform/marketplace/service';
import { formatMoney } from '@/platform/money';
import { Badge, Card, CardBody, CardHeader, EmptyState } from '@/design-system';
import { SellerQuoteActions } from './seller-quote-actions';

export const metadata: Metadata = { title: 'Quote requests', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

const STATUSES: QuoteStatus[] = ['NEW', 'QUOTED', 'ACCEPTED', 'DECLINED', 'WITHDRAWN', 'EXPIRED', 'CLOSED'];

export default async function SellerQuotesPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { id } = await params;
  const principal = await currentPrincipal();
  if (!isAuthenticated(principal) || !can(principal, 'tl.marketplace.quote.read', { organizationId: id })) notFound();
  const organization = await db().organization.findFirst({ where: { id, deletedAt: null }, select: { name: true, currency: true } });
  if (!organization) notFound();
  const sp = await searchParams;
  const status = STATUSES.find((s) => s === sp.status);
  const canManage = can(principal, 'tl.marketplace.quote.manage', { organizationId: id });
  const [quotes, stats] = await Promise.all([listSellerQuotes(principal, id, { status }), sellerQuoteStats(principal, id)]);
  const when = (d: Date) => new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kolkata' }).format(d);

  return (
    <div className="tl-page">
      <nav aria-label="Breadcrumb" className="tl-breadcrumb">
        <Link href={`/account/organizations/${id}`}>{organization.name}</Link>
        <span aria-hidden="true"> / </span>
        <span aria-current="page">Quote requests</span>
      </nav>
      <header className="tl-page__header">
        <h1>Quote requests</h1>
        <p className="tl-page__lead">
          Buyers who asked for a price. No payment passes through Toothlogy: once a quote is accepted, arrange payment and delivery with the buyer. <Link href={`/account/organizations/${id}/business`}>Catalogue</Link>
        </p>
      </header>

      <Card label="Numbers">
        <CardBody>
          <dl className="tl-kv">
            <div>
              <dt>All requests</dt>
              <dd>{stats.total}</dd>
            </div>
            <div>
              <dt>Waiting for your quote</dt>
              <dd>{stats.waiting}</dd>
            </div>
            <div>
              <dt>Won (accepted or closed)</dt>
              <dd>{stats.won}</dd>
            </div>
            <div>
              <dt>Win rate</dt>
              <dd>{stats.winRate === null ? '—' : `${stats.winRate}%`}</dd>
            </div>
          </dl>
          <nav aria-label="Filter by status" className="tl-inline" style={{ flexWrap: 'wrap' }}>
            <Link href={`/account/organizations/${id}/quotes`} aria-current={!status ? 'page' : undefined} className={`tl-button tl-button--sm ${!status ? 'tl-button--primary' : 'tl-button--ghost'}`}>
              <span>All</span>
            </Link>
            {STATUSES.map((s) => (
              <Link key={s} href={`/account/organizations/${id}/quotes?status=${s}`} aria-current={status === s ? 'page' : undefined} className={`tl-button tl-button--sm ${status === s ? 'tl-button--primary' : 'tl-button--ghost'}`}>
                <span>
                  {QUOTE_STATUS_LABEL[s]} ({stats.byStatus[s] ?? 0})
                </span>
              </Link>
            ))}
          </nav>
        </CardBody>
      </Card>

      <Card label="Requests">
        <CardHeader>
          <strong>Requests</strong>
        </CardHeader>
        <CardBody>
          {quotes.length === 0 ? (
            <EmptyState title="No requests here" description="Requests arrive when buyers ask about a published item." />
          ) : (
            <ul className="tl-list" aria-label="Quote requests">
              {quotes.map((q) => (
                <li key={q.id} className="tl-stack">
                  <div className="tl-card__title-row">
                    <strong>
                      {q.quantity} × {q.product?.name ?? 'item'}
                    </strong>
                    <Badge tone={q.status === 'NEW' ? 'info' : q.status === 'ACCEPTED' || q.status === 'CLOSED' ? 'success' : 'neutral'}>{QUOTE_STATUS_LABEL[q.status]}</Badge>
                  </div>
                  <span className="tl-list__meta">
                    {q.buyer.displayName ?? 'Buyer'}
                    {q.buyerOrganization ? ` for ${q.buyerOrganization.name}` : ''} · {q.buyer.email ? <a href={`mailto:${q.buyer.email}`}>{q.buyer.email}</a> : 'no email'}
                    {q.buyer.phone ? ` · ${q.buyer.phone}` : ''}
                    {q.deliveryDistrict ? ` · deliver to ${q.deliveryDistrict.name}` : ''} · {when(q.createdAt)}
                  </span>
                  {q.message ? <span className="tl-list__meta">“{q.message}”</span> : null}
                  {q.quotedPriceMinor !== null && q.currency ? (
                    <span className="tl-list__meta">
                      Your quote: {formatMoney({ amountMinor: q.quotedPriceMinor, currency: q.currency }, 'en-IN')}
                      {q.validUntil ? `, valid until ${when(q.validUntil)}` : ''}
                    </span>
                  ) : null}
                  {canManage && ['NEW', 'QUOTED', 'ACCEPTED'].includes(q.status) ? <SellerQuoteActions quoteRequestId={q.id} status={q.status} currency={organization.currency} /> : null}
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>
    </div>
  );
}

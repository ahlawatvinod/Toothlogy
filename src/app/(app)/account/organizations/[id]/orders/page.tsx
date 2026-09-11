/**
 * TL-PAGE-ORG-ORDERS-001 — /account/organizations/:id/orders
 *
 * A business's orders by status, newest first, each opening the order page
 * where it is confirmed, dispatched, paid and returned. For those with
 * tl.marketplace.order.read on the business; 404 for anyone else.
 */

import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { OrderStatus } from '@prisma/client';
import { currentPrincipal } from '@/platform/auth/server';
import { isAuthenticated } from '@/platform/rbac';
import { db } from '@/platform/db/client';
import { ORDER_STATUS_LABEL, PAYMENT_STATUS_LABEL, sellerOrders } from '@/platform/marketplace/orders';
import { formatMoney } from '@/platform/money';
import { isAppError } from '@/platform/kernel/errors';
import { Badge, Card, CardBody, EmptyState } from '@/design-system';

export const metadata: Metadata = { title: 'Orders', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

const STATUSES = Object.keys(ORDER_STATUS_LABEL) as OrderStatus[];

export default async function OrganizationOrdersPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { id } = await params;
  const sp = await searchParams;
  const status = typeof sp.status === 'string' && (STATUSES as string[]).includes(sp.status) ? (sp.status as OrderStatus) : undefined;
  const principal = await currentPrincipal();
  if (!isAuthenticated(principal)) notFound();
  const data = await sellerOrders(principal, id, { status }).catch((error) => {
    if (isAppError(error) && error.code === 'NOT_FOUND') return null;
    throw error;
  });
  if (!data) notFound();
  const organization = await db().organization.findUniqueOrThrow({ where: { id }, select: { name: true } });
  const when = (d: Date) => new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeZone: 'Asia/Kolkata' }).format(d);
  const total = Object.values(data.byStatus).reduce((n, c) => n + (c ?? 0), 0);

  return (
    <div className="tl-page">
      <nav aria-label="Breadcrumb" className="tl-breadcrumb">
        <Link href={`/account/organizations/${id}`}>{organization.name}</Link>
        <span aria-hidden="true"> / </span>
        <span aria-current="page">Orders</span>
      </nav>
      <header className="tl-page__header">
        <h1>Orders</h1>
        <p className="tl-page__lead">Orders buyers placed at your listed prices. Confirm, dispatch and record payments on each order.</p>
      </header>
      <nav aria-label="Filter by status" className="tl-inline" style={{ flexWrap: 'wrap' }}>
        <Link href={`/account/organizations/${id}/orders`} aria-current={!status ? 'page' : undefined} className={`tl-button tl-button--sm ${!status ? 'tl-button--secondary' : 'tl-button--ghost'}`}>
          <span>All ({total})</span>
        </Link>
        {STATUSES.map((s) => (
          <Link key={s} href={`/account/organizations/${id}/orders?status=${s}`} aria-current={status === s ? 'page' : undefined} className={`tl-button tl-button--sm ${status === s ? 'tl-button--secondary' : 'tl-button--ghost'}`}>
            <span>
              {ORDER_STATUS_LABEL[s]} ({data.byStatus[s] ?? 0})
            </span>
          </Link>
        ))}
      </nav>
      {data.orders.length === 0 ? (
        <EmptyState title="No orders here" description={status ? 'No orders in this state.' : 'Orders arrive when buyers order items you sell at a listed price.'} />
      ) : (
        <ul className="tl-list" aria-label="Orders">
          {data.orders.map((o) => (
            <li key={o.id}>
              <Card label={`Order ${o.number}`}>
                <CardBody>
                  <div className="tl-stack">
                    <div className="tl-card__title-row">
                      <Link href={`/orders/${o.id}`}>
                        <strong>{o.number}</strong>
                      </Link>
                      <Badge tone={o.status === 'PLACED' ? 'warning' : o.status === 'DELIVERED' ? 'success' : 'neutral'}>{ORDER_STATUS_LABEL[o.status]}</Badge>
                    </div>
                    <span className="tl-list__meta">
                      {o.buyerOrganization?.name ?? o.buyer.displayName ?? 'Buyer'} · {o.deliveryDistrict.name} · {when(o.placedAt)} · {o._count.lines} {o._count.lines === 1 ? 'item' : 'items'} · {formatMoney({ amountMinor: o.totalMinor, currency: o.currency }, 'en-IN')} · {PAYMENT_STATUS_LABEL[o.paymentStatus].toLowerCase()}
                      {o._count.returns > 0 ? ' · return' : ''}
                    </span>
                  </div>
                </CardBody>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

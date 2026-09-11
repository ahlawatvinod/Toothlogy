/**
 * TL-PAGE-MY-ORDERS-001 — /account/orders
 *
 * The buyer's orders: seller, when, total, where each stands, and payment as
 * the seller recorded it.
 */

import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { currentPrincipal } from '@/platform/auth/server';
import { isAuthenticated } from '@/platform/rbac';
import { myOrders, ORDER_STATUS_LABEL, PAYMENT_STATUS_LABEL } from '@/platform/marketplace/orders';
import { formatMoney } from '@/platform/money';
import { Badge, Card, CardBody, EmptyState } from '@/design-system';

export const metadata: Metadata = { title: 'My orders', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

export default async function MyOrdersPage() {
  const principal = await currentPrincipal();
  if (!isAuthenticated(principal)) redirect('/login?next=/account/orders');
  const orders = await myOrders(principal);
  const when = (d: Date) => new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeZone: 'Asia/Kolkata' }).format(d);

  return (
    <div className="tl-page">
      <header className="tl-page__header">
        <h1>My orders</h1>
        <p className="tl-page__lead">
          Orders you placed with dental businesses. <Link href="/cart">Cart</Link> · <Link href="/marketplace">Marketplace</Link>
        </p>
      </header>
      {orders.length === 0 ? (
        <EmptyState title="No orders yet" description="Items a business sells at a listed price can be added to your cart from its page." />
      ) : (
        <ul className="tl-list" aria-label="Orders">
          {orders.map((o) => (
            <li key={o.id}>
              <Card label={`Order ${o.number}`}>
                <CardBody>
                  <div className="tl-stack">
                    <div className="tl-card__title-row">
                      <Link href={`/orders/${o.id}`}>
                        <strong>{o.number}</strong>
                      </Link>
                      <Badge tone={o.status === 'DELIVERED' ? 'success' : o.status === 'CANCELLED' || o.status === 'DECLINED' ? 'neutral' : 'info'}>{ORDER_STATUS_LABEL[o.status]}</Badge>
                    </div>
                    <span className="tl-list__meta">
                      {o.seller.name} · {when(o.placedAt)} · {o._count.lines} {o._count.lines === 1 ? 'item' : 'items'} · {formatMoney({ amountMinor: o.totalMinor, currency: o.currency }, 'en-IN')} · {PAYMENT_STATUS_LABEL[o.paymentStatus].toLowerCase()}
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

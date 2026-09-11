/**
 * TL-PAGE-ORDER-001 — /orders/:id
 *
 * One order for its buyer or the seller's people: what was ordered at what
 * price and tax, delivery, how to pay the seller (once confirmed), payments
 * as the seller recorded them, tax documents, returns and history — and what
 * each side may do next. 404 for anyone else.
 */

import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { currentPrincipal } from '@/platform/auth/server';
import { isAuthenticated } from '@/platform/rbac';
import { getOrder, ORDER_STATUS_LABEL, PAYMENT_METHOD_LABEL, PAYMENT_STATUS_LABEL, RETURN_REASON_LABEL, RETURN_STATUS_LABEL } from '@/platform/marketplace/orders';
import { formatRate } from '@/platform/tax/packs';
import { formatMoney } from '@/platform/money';
import { isAppError } from '@/platform/kernel/errors';
import { Alert, Badge, Card, CardBody, CardHeader } from '@/design-system';
import { OrderActions } from '@/components/marketplace/order-actions';

export const metadata: Metadata = { title: 'Order', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

const DAY = 86_400_000;

export default async function OrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const principal = await currentPrincipal();
  if (!isAuthenticated(principal)) redirect(`/login?next=/orders/${id}`);
  const loaded = await getOrder(principal, id).catch((error) => {
    if (isAppError(error) && error.code === 'NOT_FOUND') return null;
    throw error;
  });
  if (!loaded) notFound();
  const { order, side, canManage, paymentInstructions, returnWindowDays, onlinePaymentAvailable } = loaded;
  const money = (n: bigint) => formatMoney({ amountMinor: n, currency: order.currency }, 'en-IN');
  const rupees = (n: bigint) => (Number(n) / 100).toFixed(2);
  const when = (d: Date) => new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kolkata' }).format(d);
  const day = (d: Date) => new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeZone: 'UTC' }).format(d);
  const due = order.totalMinor - order.paidMinor;
  const openReturn = order.returns.find((r) => r.status === 'REQUESTED' || r.status === 'APPROVED' || r.status === 'RECEIVED') ?? null;
  const now = new Date();
  const windowOpen = order.status === 'DELIVERED' && order.deliveredAt !== null && returnWindowDays > 0 && now.getTime() <= order.deliveredAt.getTime() + returnWindowDays * DAY;
  const returnable =
    side === 'BUYER' && windowOpen && !openReturn
      ? order.lines.filter((l) => l.quantity > l.returnedQuantity).map((l) => ({ id: l.id, name: l.variantLabel ? `${l.name} (${l.variantLabel})` : l.name, left: l.quantity - l.returnedQuantity }))
      : null;
  const lineNames = new Map(order.lines.map((l) => [l.id, l.variantLabel ? `${l.name} (${l.variantLabel})` : l.name]));

  return (
    <div className="tl-container tl-page">
      <nav aria-label="Breadcrumb" className="tl-breadcrumb">
        {side === 'BUYER' ? <Link href="/account/orders">My orders</Link> : <Link href={`/account/organizations/${order.seller.id}/orders`}>Orders</Link>}
      </nav>
      <header className="tl-page__header">
        <div className="tl-card__title-row">
          <h1>Order {order.number}</h1>
          <Badge tone={order.status === 'DELIVERED' ? 'success' : order.status === 'CANCELLED' || order.status === 'DECLINED' ? 'neutral' : 'info'}>{ORDER_STATUS_LABEL[order.status]}</Badge>
          <Badge tone={order.paymentStatus === 'PAID' ? 'success' : 'neutral'}>{PAYMENT_STATUS_LABEL[order.paymentStatus]}</Badge>
        </div>
        <p className="tl-page__lead">
          {side === 'BUYER' ? (
            <>
              From <Link href={`/suppliers/${order.seller.slug}`}>{order.seller.name}</Link>
            </>
          ) : (
            <>From {order.buyerOrganization?.name ? `${order.buyerOrganization.name} (${order.buyer.displayName ?? 'buyer'})` : (order.buyer.displayName ?? 'a buyer')}</>
          )}{' '}
          · placed {when(order.placedAt)}
        </p>
      </header>

      {order.status === 'DECLINED' && order.sellerNote ? <Alert tone="info">Declined by the seller: {order.sellerNote}</Alert> : null}
      {order.status === 'CANCELLED' ? <Alert tone="info">Cancelled{order.cancelReason ? `: ${order.cancelReason}` : '.'}</Alert> : null}

      <Card label="Items">
        <CardHeader>
          <strong>Items</strong>
        </CardHeader>
        <CardBody>
          <div style={{ overflowX: 'auto', position: 'relative' }}>
            <table className="tl-table">
              <caption className="tl-visually-hidden">Items in order {order.number}</caption>
              <thead>
                <tr>
                  <th scope="col">Item</th>
                  <th scope="col">Price</th>
                  <th scope="col">Quantity</th>
                  <th scope="col">Tax</th>
                  <th scope="col">Amount</th>
                </tr>
              </thead>
              <tbody>
                {order.lines.map((l) => (
                  <tr key={l.id}>
                    <td>
                      <strong>{l.name}</strong>
                      {l.variantLabel ? <div className="tl-muted">{l.variantLabel}</div> : null}
                      {l.returnedQuantity > 0 ? <div className="tl-muted">{l.returnedQuantity} returned</div> : null}
                    </td>
                    <td>
                      {money(l.unitPriceMinor)}
                      {l.unit ? ` per ${l.unit}` : ''}
                    </td>
                    <td>{l.quantity}</td>
                    <td>
                      {formatRate(l.taxRateBasisPoints)} · {money(l.taxMinor)}
                    </td>
                    <td>{money(l.grossMinor)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <dl className="tl-kv">
            <div>
              <dt>Before tax</dt>
              <dd>{money(order.subtotalMinor)}</dd>
            </div>
            <div>
              <dt>Tax</dt>
              <dd>{money(order.taxMinor)}</dd>
            </div>
            <div>
              <dt>Total</dt>
              <dd>
                <strong>{money(order.totalMinor)}</strong>
              </dd>
            </div>
          </dl>
        </CardBody>
      </Card>

      <Card label="Delivery">
        <CardHeader>
          <strong>Delivery</strong>
        </CardHeader>
        <CardBody>
          <dl className="tl-kv">
            <div>
              <dt>To</dt>
              <dd>
                {order.deliveryName}, {order.deliveryPhone}
                <div>
                  {order.deliveryAddress}, {order.deliveryDistrict.name}, {order.deliveryDistrict.region.name}
                </div>
              </dd>
            </div>
            {order.carrier || order.trackingReference ? (
              <div>
                <dt>Shipped</dt>
                <dd>{[order.carrier, order.trackingReference ? `tracking ${order.trackingReference}` : null].filter(Boolean).join(', ')}</dd>
              </div>
            ) : null}
            {order.buyerNote ? (
              <div>
                <dt>Buyer’s note</dt>
                <dd>{order.buyerNote}</dd>
              </div>
            ) : null}
            {side === 'BUYER' ? (
              <div>
                <dt>Seller</dt>
                <dd>{[order.seller.name, order.seller.phone, order.seller.email].filter(Boolean).join(' · ')}</dd>
              </div>
            ) : (
              <div>
                <dt>Buyer</dt>
                <dd>{[order.buyer.displayName, order.buyer.phone, order.buyer.email].filter(Boolean).join(' · ')}</dd>
              </div>
            )}
          </dl>
        </CardBody>
      </Card>

      <Card label="Payment">
        <CardHeader>
          <strong>Payment</strong>
        </CardHeader>
        <CardBody>
          <div className="tl-stack">
            {side === 'BUYER' && order.status === 'PLACED' ? <p style={{ margin: 0 }}>Wait for {order.seller.name} to confirm the order before paying.</p> : null}
            {paymentInstructions && due > BigInt(0) ? (
              <div>
                <strong>How to pay {order.seller.name}</strong> (as the seller states it)
                <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{paymentInstructions}</p>
              </div>
            ) : null}
            {side === 'BUYER' && !onlinePaymentAvailable && order.status !== 'PLACED' && due > BigInt(0) ? (
              <p className="tl-muted" style={{ margin: 0 }}>
                Online payment is not available on Toothlogy yet. Pay the seller directly; it records what it receives here.
              </p>
            ) : null}
            <p style={{ margin: 0 }}>
              Recorded as paid: <strong>{money(order.paidMinor)}</strong> of {money(order.totalMinor)}
              {order.refundedMinor > BigInt(0) ? ` · refunded ${money(order.refundedMinor)}` : ''}
            </p>
            {order.payments.length > 0 ? (
              <ul className="tl-list" aria-label="Payments recorded">
                {order.payments.map((p) => (
                  <li key={p.id} className="tl-list__meta">
                    {p.kind === 'RECEIPT' ? 'Received' : 'Refunded'} {money(p.amountMinor)} by {PAYMENT_METHOD_LABEL[p.method].toLowerCase()} on {day(p.receivedOn)}
                    {p.reference ? ` · ref ${p.reference}` : ''}
                  </li>
                ))}
              </ul>
            ) : null}
            <p className="tl-muted" style={{ margin: 0 }}>
              Payments are recorded by the seller. Toothlogy did not take or pass on this money.
            </p>
          </div>
        </CardBody>
      </Card>

      {order.taxDocuments.length > 0 ? (
        <Card label="Tax documents">
          <CardHeader>
            <strong>Tax documents</strong>
          </CardHeader>
          <CardBody>
            <ul className="tl-list">
              {order.taxDocuments.map((d) => (
                <li key={d.id}>
                  <Link href={`/tax-documents/${d.id}`}>
                    {d.kind === 'INVOICE' ? 'Tax invoice' : 'Credit note'} {d.number}
                  </Link>{' '}
                  · {money(d.totalMinor)}
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      ) : null}

      {order.returns.length > 0 ? (
        <Card label="Returns">
          <CardHeader>
            <strong>Returns</strong>
          </CardHeader>
          <CardBody>
            <ul className="tl-list">
              {order.returns.map((r) => (
                <li key={r.id} className="tl-stack">
                  <div className="tl-card__title-row">
                    <span>
                      {RETURN_REASON_LABEL[r.reason]} · refund {money(r.refundMinor)}
                    </span>
                    <Badge tone={r.status === 'REFUNDED' ? 'success' : 'info'}>{RETURN_STATUS_LABEL[r.status]}</Badge>
                  </div>
                  <span className="tl-list__meta">
                    {(r.lines as Array<{ orderLineId: string; quantity: number }>).map((l) => `${l.quantity} × ${lineNames.get(l.orderLineId) ?? 'item'}`).join(', ')}
                    {r.details ? ` — “${r.details}”` : ''}
                    {r.sellerNote ? ` · seller: “${r.sellerNote}”` : ''}
                  </span>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      ) : null}

      <OrderActions
        orderId={order.id}
        side={side}
        canManage={canManage}
        status={order.status}
        invoiceIssued={order.taxDocuments.some((d) => d.kind === 'INVOICE')}
        dueRupees={rupees(due > BigInt(0) ? due : BigInt(0))}
        refundableRupees={rupees(order.paidMinor - order.refundedMinor)}
        onlinePaymentAvailable={onlinePaymentAvailable}
        openReturn={openReturn ? { id: openReturn.id, status: openReturn.status, refundRupees: rupees(openReturn.refundMinor) } : null}
        returnable={returnable}
        today={new Date().toISOString().slice(0, 10)}
      />

      <Card label="History">
        <CardHeader>
          <strong>History</strong>
        </CardHeader>
        <CardBody>
          <ol className="tl-list">
            {order.events.map((e) => (
              <li key={e.id} className="tl-list__meta">
                {when(e.createdAt)} · {e.action.toLowerCase().replace(/_/g, ' ')}
                {e.note ? ` — ${e.note}` : ''}
              </li>
            ))}
          </ol>
        </CardBody>
      </Card>
    </div>
  );
}

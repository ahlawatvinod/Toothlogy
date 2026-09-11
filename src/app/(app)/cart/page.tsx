/**
 * TL-PAGE-CART-001 — /cart
 *
 * The signed-in buyer's cart: one group per seller (each becomes one order),
 * at current prices, with anything that stops an order spelt out, and the
 * delivery details to place each order. The buyer pays the seller directly
 * once it confirms; no money is taken on Toothlogy.
 */

import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { currentPrincipal } from '@/platform/auth/server';
import { isAuthenticated } from '@/platform/rbac';
import { db } from '@/platform/db/client';
import { myCart } from '@/platform/marketplace/orders';
import { listDistricts } from '@/platform/india-data/districts';
import { formatMoney } from '@/platform/money';
import { EmptyState } from '@/design-system';
import { CartSeller } from '@/components/marketplace/cart-seller';

export const metadata: Metadata = { title: 'Cart', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

export default async function CartPage() {
  const principal = await currentPrincipal();
  if (!isAuthenticated(principal)) redirect('/login?next=/cart');
  const [cart, districts, me, organizations] = await Promise.all([
    myCart(principal),
    listDistricts({ countryCode: 'IN' }),
    db().user.findUnique({ where: { id: principal.userId }, select: { displayName: true, phone: true, emailVerifiedAt: true } }),
    db().organization.findMany({ where: { id: { in: principal.organizations.map((o) => o.organizationId) }, deletedAt: null }, select: { id: true, name: true } }),
  ]);
  const money = (amountMinor: bigint, currency: string) => formatMoney({ amountMinor, currency }, 'en-IN');

  return (
    <div className="tl-container tl-page">
      <header className="tl-page__header">
        <h1>Cart</h1>
        <p className="tl-page__lead">
          Each seller’s items become one order. Prices include tax. You pay the seller directly once it confirms your order; Toothlogy takes no payment. <Link href="/account/orders">My orders</Link>
        </p>
      </header>
      {cart.sellers.length === 0 ? (
        <EmptyState title="Your cart is empty" description="Add items sold at a listed price from a business’s page in the marketplace." />
      ) : (
        cart.sellers.map((group) => (
          <CartSeller
            key={group.seller.id}
            seller={group.seller}
            total={money(group.totalMinor, group.currency)}
            problems={group.problems}
            lines={group.lines.map((l) => ({
              id: l.id,
              productId: l.productId,
              variantId: l.variantId,
              name: l.name,
              variantLabel: l.variantLabel,
              unit: l.unit,
              quantity: l.quantity,
              minimum: l.minimum,
              unitPrice: l.unitPriceMinor === null ? null : money(l.unitPriceMinor, group.currency),
              gross: l.grossMinor === null ? null : money(l.grossMinor, group.currency),
              problem: l.problem,
            }))}
            districts={districts.map((d) => ({ id: d.id, label: `${d.name}, ${d.state}` }))}
            organizations={organizations}
            defaults={{ name: me?.displayName ?? '', phone: me?.phone ?? '' }}
            emailVerified={Boolean(me?.emailVerifiedAt)}
          />
        ))
      )}
    </div>
  );
}

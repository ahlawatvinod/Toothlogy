/**
 * TL-PAGE-SUPPLIER-001 — /suppliers/:slug
 *
 * A dental business: what it is, where it delivers, what it states about
 * itself (labelled as such unless the organization is verified), its
 * published products and services, and the quote request form for
 * signed-in buyers with a verified email.
 */

import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getPublicBusiness } from '@/platform/marketplace/service';
import { BUSINESS_TYPE_LABEL, CATEGORY_BY_KEY, isBusinessType } from '@/platform/catalogue/marketplace';
import { currentPrincipal } from '@/platform/auth/server';
import { isAuthenticated } from '@/platform/rbac';
import { db } from '@/platform/db/client';
import { formatMoney } from '@/platform/money';
import { Badge, Card, CardBody, CardHeader, EmptyState, Table } from '@/design-system';
import { QuoteRequestForm } from './quote-request-form';
import { AddToCartForm } from './add-to-cart-form';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const business = await getPublicBusiness((await params).slug);
  if (!business) return { title: 'Business not found', robots: { index: false, follow: false } };
  return { title: business.name, robots: business.isVerified ? undefined : { index: false, follow: true } };
}

export default async function SupplierPage({ params }: { params: Promise<{ slug: string }> }) {
  const business = await getPublicBusiness((await params).slug);
  if (!business) notFound();
  const principal = await currentPrincipal();
  const viewer = isAuthenticated(principal)
    ? {
        emailVerifiedAt: (await db().user.findUnique({ where: { id: principal.userId }, select: { emailVerifiedAt: true } }))?.emailVerifiedAt ?? null,
        isMember: (await db().organizationMember.count({ where: { organizationId: business.id, userId: principal.userId, leftAt: null } })) > 0,
        organizations: await db().organization.findMany({ where: { id: { in: principal.organizations.map((o) => o.organizationId) }, deletedAt: null }, select: { id: true, name: true } }),
      }
    : null;
  const profile = business.businessProfile;
  const place = business.locations[0];
  const label = isBusinessType(business.type) ? BUSINESS_TYPE_LABEL[business.type] : business.type.toLowerCase();

  return (
    <div className="tl-container tl-page">
      <nav aria-label="Breadcrumb" className="tl-breadcrumb">
        <Link href="/marketplace">Marketplace</Link>
        <span aria-hidden="true"> / </span>
        <span aria-current="page">{business.name}</span>
      </nav>
      <header className="tl-page__header">
        <div className="tl-card__title-row">
          <h1>{business.name}</h1>
          {business.isVerified ? <Badge tone="success">Verified business</Badge> : null}
        </div>
        <p className="tl-page__lead">
          {label}
          {place?.district ? ` · ${[place.address?.locality, place.district.name, place.district.region.name].filter(Boolean).join(', ')}` : ''}
        </p>
      </header>

      {!business.isClaimed ? (
        <Card label="Unclaimed listing">
          <CardBody>
            <p style={{ margin: 0 }}>Toothlogy listed this business from public records. Nobody from it manages this page yet, so it shows no products.</p>
          </CardBody>
        </Card>
      ) : null}

      <Card label="About">
        <CardBody>
          <dl className="tl-kv">
            <div>
              <dt>Delivers to</dt>
              <dd>{profile?.servesAllIndia ? 'All of India' : profile?.serviceAreas.length ? profile.serviceAreas.map((a) => a.district.name).join(', ') : 'Not stated'}</dd>
            </div>
            {profile?.categories.length ? (
              <div>
                <dt>Deals in</dt>
                <dd>{profile.categories.map((c) => CATEGORY_BY_KEY.get(c)?.label ?? c).join(', ')}</dd>
              </div>
            ) : null}
            {profile?.brands.length ? (
              <div>
                <dt>Brands</dt>
                <dd>{profile.brands.join(', ')}</dd>
              </div>
            ) : null}
            {profile?.turnaroundDays ? (
              <div>
                <dt>Usual turnaround</dt>
                <dd>{profile.turnaroundDays} working days</dd>
              </div>
            ) : null}
            {profile?.deliveryNote ? (
              <div>
                <dt>Delivery</dt>
                <dd>{profile.deliveryNote}</dd>
              </div>
            ) : null}
            {profile?.minimumOrderNote ? (
              <div>
                <dt>Minimum order</dt>
                <dd>{profile.minimumOrderNote}</dd>
              </div>
            ) : null}
            {profile?.gstin ? (
              <div>
                <dt>GSTIN</dt>
                <dd>
                  {profile.gstin}
                  <div className="tl-muted">{business.isVerified ? 'Checked with the business’s verification.' : 'As stated by the business.'}</div>
                </dd>
              </div>
            ) : null}
          </dl>
          {business.description ? <p>{business.description}</p> : null}
        </CardBody>
      </Card>

      <Card label="Products and services">
        <CardHeader>
          <strong>Products and services</strong>
        </CardHeader>
        <CardBody>
          {business.products.length === 0 ? (
            <EmptyState title="Nothing published" description="This business has not published its catalogue yet." />
          ) : (
            <div style={{ overflowX: 'auto', position: 'relative' }}>
              <Table caption="Published products and services">
                <thead>
                  <tr>
                    <th scope="col">Item</th>
                    <th scope="col">Category</th>
                    <th scope="col">Indicative price</th>
                    <th scope="col">Minimum</th>
                  </tr>
                </thead>
                <tbody>
                  {business.products.map((p) => (
                    <tr key={p.id}>
                      <td>
                        <strong>{p.name}</strong>
                        {p.brand ? <div className="tl-muted">{p.brand}</div> : null}
                      </td>
                      <td>{CATEGORY_BY_KEY.get(p.category)?.label ?? p.category}</td>
                      <td>
                        {p.variants.length > 0 && p.currency
                          ? `from ${formatMoney({ amountMinor: p.variants.reduce((min, v) => (v.priceMinor < min ? v.priceMinor : min), p.variants[0]!.priceMinor), currency: p.currency }, 'en-IN')}`
                          : p.priceMinor !== null && p.currency
                            ? `${formatMoney({ amountMinor: p.priceMinor, currency: p.currency }, 'en-IN')}${p.unit ? ` per ${p.unit}` : ''}`
                            : 'On request'}
                        {p.orderable ? <div className="tl-muted">Can be ordered</div> : null}
                      </td>
                      <td>{p.minOrderQuantity}</td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </div>
          )}
        </CardBody>
      </Card>

      {business.products.some((p) => p.orderable) ? (
        <Card label="Buy at the listed price">
          <CardHeader>
            <strong>Buy at the listed price</strong>
          </CardHeader>
          <CardBody>
            {!viewer ? (
              <p style={{ margin: 0 }}>
                <Link href={`/login?next=/suppliers/${business.slug}`}>Sign in</Link> to order from {business.name}.
              </p>
            ) : viewer.isMember ? (
              <p style={{ margin: 0 }}>You work for this business.</p>
            ) : (
              <AddToCartForm
                items={business.products
                  .filter((p) => p.orderable)
                  .map((p) => ({
                    id: p.id,
                    label: `${p.name}${p.unit ? ` (per ${p.unit})` : ''}`,
                    minimum: p.minOrderQuantity,
                    variants: p.variants.map((v) => ({ id: v.id, label: v.label, price: formatMoney({ amountMinor: v.priceMinor, currency: p.currency ?? 'INR' }, 'en-IN'), available: v.available })),
                  }))}
              />
            )}
            <p className="tl-muted">You pay {business.name} directly once it confirms your order. Toothlogy takes no payment.</p>
          </CardBody>
        </Card>
      ) : null}

      {business.products.length > 0 ? (
        <Card label="Ask for a quote">
          <CardHeader>
            <strong>Ask for a quote</strong>
          </CardHeader>
          <CardBody>
            {!viewer ? (
              <p style={{ margin: 0 }}>
                <Link href={`/login?next=/suppliers/${business.slug}`}>Sign in</Link> to ask {business.name} for a quote.
              </p>
            ) : !viewer.emailVerifiedAt ? (
              <p style={{ margin: 0 }}>Verify your email address first, so the seller can reply to you.</p>
            ) : viewer.isMember ? (
              <p style={{ margin: 0 }}>You work for this business.</p>
            ) : (
              <QuoteRequestForm
                sellerName={business.name}
                products={business.products.map((p) => ({ id: p.id, label: `${p.name}${p.unit ? ` (per ${p.unit})` : ''}`, minimum: p.minOrderQuantity }))}
                organizations={viewer.organizations}
              />
            )}
          </CardBody>
        </Card>
      ) : null}
    </div>
  );
}

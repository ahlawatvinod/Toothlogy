/**
 * TL-PAGE-ORG-BUSINESS-001 — /account/organizations/:id/business
 *
 * A dental business's trading profile, the districts it serves, and its
 * catalogue (add, edit, publish, archive). For its administrators; 404 for
 * anyone else, and for organizations that are not businesses.
 */

import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { currentPrincipal } from '@/platform/auth/server';
import { isAuthenticated } from '@/platform/rbac';
import { businessConsole } from '@/platform/marketplace/service';
import { CATEGORY_BY_KEY, MARKETPLACE_CATEGORIES } from '@/platform/catalogue/marketplace';
import { listDistricts } from '@/platform/india-data/districts';
import { formatMoney } from '@/platform/money';
import { isAppError } from '@/platform/kernel/errors';
import { Badge, Card, CardBody, CardHeader, EmptyState } from '@/design-system';
import { BusinessProfileForm, NewProductForm, ProductEditor } from './business-forms';

export const metadata: Metadata = { title: 'Catalogue', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

export default async function BusinessPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const principal = await currentPrincipal();
  if (!isAuthenticated(principal)) notFound();
  const data = await businessConsole(principal, id).catch((error) => {
    if (isAppError(error) && (error.code === 'NOT_FOUND' || error.code === 'PRECONDITION_FAILED')) return null;
    throw error;
  });
  if (!data) notFound();
  const { organization, profile, products } = data;
  const districts = await listDistricts({ countryCode: 'IN' });
  const categories = MARKETPLACE_CATEGORIES.map((c) => ({ key: c.key, label: c.label, kind: c.kind }));

  return (
    <div className="tl-page">
      <nav aria-label="Breadcrumb" className="tl-breadcrumb">
        <Link href={`/account/organizations/${id}`}>{organization.name}</Link>
        <span aria-hidden="true"> / </span>
        <span aria-current="page">Catalogue</span>
      </nav>
      <header className="tl-page__header">
        <h1>Catalogue</h1>
        <p className="tl-page__lead">
          What buyers see on your marketplace page. <Link href={`/account/organizations/${id}/quotes`}>Quote requests</Link> · <Link href={`/account/organizations/${id}/orders`}>Orders</Link>
        </p>
      </header>

      <Card label="Business profile">
        <CardHeader>
          <strong>Business profile</strong>
        </CardHeader>
        <CardBody>
          <BusinessProfileForm
            organizationId={id}
            isLaboratory={organization.type === 'LABORATORY'}
            categories={categories}
            districts={districts.map((d) => ({ id: d.id, label: `${d.name}, ${d.state}` }))}
            profile={{
              categories: profile?.categories ?? [],
              brands: (profile?.brands ?? []).join(', '),
              gstin: profile?.gstin ?? '',
              establishedYear: profile?.establishedYear ? String(profile.establishedYear) : '',
              deliveryNote: profile?.deliveryNote ?? '',
              minimumOrderNote: profile?.minimumOrderNote ?? '',
              turnaroundDays: profile?.turnaroundDays ? String(profile.turnaroundDays) : '',
              servesAllIndia: profile?.servesAllIndia ?? false,
              serviceDistrictIds: profile?.serviceAreas.map((a) => a.districtId) ?? [],
              returnWindowDays: String(profile?.returnWindowDays ?? 0),
              paymentInstructions: profile?.paymentInstructions ?? '',
            }}
          />
        </CardBody>
      </Card>

      <Card label="Products and services">
        <CardHeader>
          <strong>Products and services</strong>
        </CardHeader>
        <CardBody>
          {products.length === 0 ? <EmptyState title="No products yet" description="Add your first product or service below. It stays a draft until you publish it." /> : null}
          <ul className="tl-list" aria-label="Catalogue">
            {products.map((p) => (
              <li key={p.id} className="tl-stack">
                <div className="tl-card__title-row">
                  <strong>{p.name}</strong>
                  <Badge tone={p.status === 'PUBLISHED' ? 'success' : p.status === 'DRAFT' ? 'warning' : 'neutral'}>{p.status.toLowerCase()}</Badge>
                </div>
                <span className="tl-list__meta">
                  {CATEGORY_BY_KEY.get(p.category)?.label ?? p.category} · {p.priceMinor !== null && p.currency ? formatMoney({ amountMinor: p.priceMinor, currency: p.currency }, 'en-IN') : 'price on request'}
                  {p.unit ? ` per ${p.unit}` : ''} · minimum {p.minOrderQuantity} · {p.gstRatePercent === null ? 'tax rate not set' : `GST ${p.gstRatePercent}%`} · {p._count.quoteRequests} quote requests · ordered {p._count.orderLines} times
                  {p.orderable ? ' · sold at the listed price' : ''}
                  {p.variants.some((v) => v.status === 'ACTIVE') ? ` · ${p.variants.filter((v) => v.status === 'ACTIVE').length} variants` : ''}
                </span>
                <ProductEditor
                  product={{
                    id: p.id,
                    status: p.status,
                    priceRupees: p.priceMinor === null ? '' : String(Number(p.priceMinor) / 100),
                    minOrderQuantity: String(p.minOrderQuantity),
                    description: p.description ?? '',
                    orderable: p.orderable,
                    gstRatePercent: p.gstRatePercent === null ? '' : String(p.gstRatePercent),
                    taxCode: p.taxCode ?? '',
                    variants: p.variants.map((v) => ({ id: v.id, label: v.label, sku: v.sku ?? '', priceRupees: (Number(v.priceMinor) / 100).toFixed(2), available: v.available, status: v.status })),
                  }}
                />
              </li>
            ))}
          </ul>
        </CardBody>
      </Card>

      <Card label="Add a product or service">
        <CardHeader>
          <strong>Add a product or service</strong>
        </CardHeader>
        <CardBody>
          <NewProductForm organizationId={id} categories={categories} currency={organization.currency} />
        </CardBody>
      </Card>
    </div>
  );
}

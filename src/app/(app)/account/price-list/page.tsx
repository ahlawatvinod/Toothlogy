/**
 * TL-PAGE-PRICELIST-001 — /account/price-list
 *
 * The dentist's own price list.
 *
 * A server component that loads the catalogue and the dentist's existing prices
 * before anything is sent, so the page arrives populated rather than flashing an
 * empty table and filling in after hydration. The editing itself needs the
 * client, and lives in `price-list-client.tsx`.
 *
 * A dentist with no profile yet is sent to create one rather than shown an
 * empty price list: prices hang off the professional profile, and an editor
 * that cannot save anything is a dead end.
 */

import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { currentPrincipal } from '@/platform/auth/server';
import { isAuthenticated } from '@/platform/rbac';
import { db } from '@/platform/db/client';
import { hasDatabase } from '@/platform/config';
import { listCatalogue, listPriceUnits } from '@/platform/catalogue/service';
import { listOwnPriceList } from '@/platform/pricing/service';
import { describePrice, describeSuggestedRange } from '@/platform/pricing/display';
import { resolveDescription, resolveShortDescription } from '@/platform/pricing/description';
import { Alert, Badge, Card, CardBody } from '@/design-system';
import { PriceListClient, type CatalogueOption, type PriceRowView } from './price-list-client';

export const metadata: Metadata = {
  title: 'My price list',
  description: 'Set what you charge for each treatment, at each of your clinics.',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

export default async function PriceListPage() {
  const principal = await currentPrincipal();
  if (!isAuthenticated(principal)) redirect('/login?next=/account/price-list');

  // The platform runs without a database for local UI work; say so rather than
  // throwing a 500 that looks like a bug.
  if (!hasDatabase()) {
    return (
      <div className="tl-container tl-page" style={{ maxWidth: '52rem' }}>
        <header className="tl-page__header">
          <h1>My price list</h1>
        </header>
        <Alert tone="warning" title="No database is configured">
          Price lists are stored in the database. Set <code>DATABASE_URL</code> and run the
          migrations to use this page.
        </Alert>
      </div>
    );
  }

  const profile = await db().dentistProfile.findUnique({
    where: { userId: principal.userId },
    include: {
      practices: {
        where: { isConfirmed: true },
        include: { location: { select: { id: true, name: true } } },
      },
    },
  });

  if (!profile) {
    return (
      <div className="tl-container tl-page" style={{ maxWidth: '52rem' }}>
        <header className="tl-page__header">
          <h1>My price list</h1>
          <p className="tl-page__lead">
            Prices belong to your professional profile, so that is the first step.
          </p>
        </header>
        <Card label="Create your profile first">
          <CardBody>
            <p className="tl-muted">
              Once your dentist profile exists you can price any treatment in the catalogue, and
              set different prices at each of your clinics.
            </p>
            <Link className="tl-button tl-button--primary tl-button--md" href="/account/dentist-profile">
              Create your dentist profile
            </Link>
          </CardBody>
        </Card>
      </div>
    );
  }

  const [categories, units, rows] = await Promise.all([
    listCatalogue(),
    listPriceUnits(),
    listOwnPriceList(principal.userId),
  ]);

  const catalogue: CatalogueOption[] = categories.flatMap((category) =>
    category.services.map((service) => ({
      slug: service.slug,
      name: service.name,
      shortDescription: service.shortDescription,
      description: service.description,
      categoryName: category.name,
      categorySlug: category.slug,
      defaultUnitKey: service.defaultUnit?.key ?? 'per_visit',
      isCustomQuote: service.isCustomQuote,
      synonyms: service.synonyms.map((synonym) => synonym.keyword),
      variants: service.variants.map((variant) => ({ slug: variant.slug, name: variant.name })),
      suggested: describeSuggestedRange({
        minMinor: service.suggestedMinMinor,
        maxMinor: service.suggestedMaxMinor,
        currency: service.suggestedCurrency ?? 'INR',
        openEnded: service.suggestedIsOpenEnded,
        isCustomQuote: service.isCustomQuote,
      }),
    })),
  );

  const priceRows: PriceRowView[] = rows.map((row) => ({
    id: row.id,
    serviceSlug: row.service.slug,
    serviceName: row.service.name,
    categoryName: row.service.category.name,
    locationId: row.location?.id ?? null,
    locationName: row.location?.name ?? null,
    isEnabled: row.isEnabled,
    isPublicVisible: row.isPublicVisible,
    note: row.note,
    description: resolveShortDescription({
      dentistService: row.customDescription,
      masterService: row.service.description,
      masterServiceShort: row.service.shortDescription,
    }),
    customDescription: row.customDescription,
    suggested: describeSuggestedRange({
      minMinor: row.service.suggestedMinMinor,
      maxMinor: row.service.suggestedMaxMinor,
      currency: row.service.suggestedCurrency ?? 'INR',
      openEnded: row.service.suggestedIsOpenEnded,
      isCustomQuote: row.service.isCustomQuote,
    }),
    variants: row.variantPrices.map((price) => ({
      variantSlug: price.variant?.slug ?? null,
      variantName: price.variant?.name ?? null,
      unitKey: price.unit.key,
      currency: price.currency,
      isCustomQuote: price.isCustomQuote,
      isEnabled: price.isEnabled,
      description: resolveDescription({
        dentistVariant: price.customDescription,
        dentistService: row.customDescription,
        masterVariant: price.variant?.description,
        masterService: row.service.description,
      }),
      customDescription: price.customDescription,
      minMinor: price.minMinor?.toString() ?? '',
      maxMinor: price.maxMinor?.toString() ?? '',
      actualMinor: price.actualMinor?.toString() ?? '',
      discountedMinor: price.discountedMinor?.toString() ?? '',
      display: describePrice({
        minMinor: price.minMinor,
        maxMinor: price.maxMinor,
        actualMinor: price.actualMinor,
        discountedMinor: price.discountedMinor,
        packageMinor: price.packageMinor,
        currency: price.currency,
        isCustomQuote: price.isCustomQuote,
        unitLabel: price.unit.shortLabel,
      }),
    })),
  }));

  const clinics = profile.practices.map((practice) => ({
    id: practice.location.id,
    name: practice.location.name,
  }));

  return (
    <div className="tl-container tl-page">
      <header className="tl-page__header">
        <div className="tl-card__title-row">
          <h1>My price list</h1>
          {profile.isDiscoverable ? (
            <Badge tone="success">Visible to patients</Badge>
          ) : (
            <Badge tone="warning">Not yet discoverable</Badge>
          )}
        </div>
        <p className="tl-page__lead">
          Set what you charge for each treatment. Prices you leave unset are simply not shown —
          Toothlogy never fills a gap with the market range and presents it as yours.
        </p>
      </header>

      {!profile.isDiscoverable ? (
        <Alert tone="info" title="These prices are not public yet">
          Your profile becomes discoverable once your qualifications are verified and you have at
          least one confirmed clinic. You can set prices now; they publish when it is.
        </Alert>
      ) : null}

      {clinics.length === 0 ? (
        <Alert tone="info" title="No confirmed clinics yet">
          You can set one general price list now. Once a clinic confirms you practise there, you
          will be able to set a different price at that clinic.
        </Alert>
      ) : null}

      <PriceListClient catalogue={catalogue} units={units.map((unit) => ({ key: unit.key, name: unit.name, shortLabel: unit.shortLabel }))} clinics={clinics} initialRows={priceRows} />
    </div>
  );
}

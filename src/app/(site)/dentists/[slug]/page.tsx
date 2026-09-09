/**
 * TL-PAGE-DENTISTPUBLIC-001 — /dentists/:slug
 *
 * The public professional profile — the page the DISCOVER pillar exists to send
 * patients to.
 *
 * Two rules it enforces:
 *
 * 1. **Only discoverable dentists resolve.** `getPublicDentistProfile` returns
 *    null for anything unverified, so a profile reachable by URL but excluded
 *    from search cannot exist. Otherwise an unverified dentist could share a
 *    direct link and present as listed on Toothlogy.
 * 2. **Only verified qualifications are shown.** Displaying a claimed credential
 *    beside a verified badge implies it was checked.
 */

import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getPublicDentistProfile } from '@/platform/dentists/service';
import { listPublicPriceList } from '@/platform/pricing/service';
import { describePrice, describeSuggestedRange } from '@/platform/pricing/display';
import { resolvePriceList } from '@/platform/pricing/resolution';
import { resolveDescription } from '@/platform/pricing/description';
import { formatMoney, money } from '@/platform/money';
import { LANGUAGE_BY_CODE } from '@/registry/globalization';
import { Badge, Card, CardBody, CardHeader } from '@/design-system';

export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const profile = await getPublicDentistProfile(slug);

  if (!profile) {
    return { title: 'Dentist not found', robots: { index: false, follow: false } };
  }

  const name = profile.user.displayName ?? 'Dentist';

  return {
    title: `${name} — verified dentist on Toothlogy`,
    description:
      profile.headline ??
      `${name} is a verified dentist on Toothlogy. View qualifications, specialties and languages.`,
    // Indexable: this is exactly the content the DISCOVER pillar wants found,
    // and it only exists for verified dentists.
    robots: { index: true, follow: true },
    openGraph: {
      title: `${name} — verified dentist`,
      description: profile.headline ?? undefined,
      type: 'profile',
    },
  };
}

export default async function PublicDentistPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const profile = await getPublicDentistProfile(slug);

  if (!profile) notFound();

  /*
   * Published prices, grouped by category.
   *
   * `resolvePriceList` collapses a general price and a clinic override for the
   * same treatment into one entry — without it the same crown would appear
   * twice at two prices, which is worse than showing no price at all.
   */
  const priceList = await listPublicPriceList(slug);
  const priceEntries = priceList
    ? [...resolvePriceList(priceList.rows, null).values()]
        .map((entry) => entry.row)
        .filter((row): row is NonNullable<typeof row> => row !== null)
    : [];

  const pricesByCategory = new Map<string, typeof priceEntries>();
  for (const row of priceEntries) {
    const key = row.service.category.name;
    const bucket = pricesByCategory.get(key);
    if (bucket) bucket.push(row);
    else pricesByCategory.set(key, [row]);
  }

  const name = profile.user.displayName ?? 'Dentist';
  const yearsPractising = profile.practisingSince
    ? new Date().getFullYear() - profile.practisingSince
    : null;

  /*
   * Structured data so search engines can render a rich result. Emitted only
   * for verified dentists — publishing Physician markup for an unverified
   * profile would be a false credential claim to every search engine that reads
   * it, which is a considerably worse version of showing it on our own site.
   */
  const structuredData = {
    '@context': 'https://schema.org',
    '@type': 'Dentist',
    name,
    description: profile.bio ?? profile.headline ?? undefined,
    knowsLanguage: profile.languages.map((code) => LANGUAGE_BY_CODE.get(code)?.name ?? code),
    medicalSpecialty: profile.specialties.map((s) => s.specialty.name),
  };

  return (
    <div className="tl-container tl-page" style={{ maxWidth: '46rem' }}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />

      <header className="tl-page__header">
        <div className="tl-card__title-row">
          <h1>{name}</h1>
          <Badge tone="success">Verified</Badge>
        </div>
        {profile.headline ? <p className="tl-page__lead">{profile.headline}</p> : null}
        <p className="tl-muted">
          {yearsPractising !== null ? `${yearsPractising} years practising · ` : ''}
          {profile.languages
            .map((code) => LANGUAGE_BY_CODE.get(code)?.name ?? code)
            .join(', ')}
        </p>
      </header>

      {profile.bio ? (
        <div className="tl-prose">
          <p>{profile.bio}</p>
        </div>
      ) : null}

      {profile.specialties.length > 0 ? (
        <Card label="Specialties">
          <CardHeader>
            <strong>Specialties</strong>
          </CardHeader>
          <CardBody>
            <ul className="tl-list">
              {profile.specialties.map((s) => (
                <li key={s.specialty.key}>
                  <strong>{s.specialty.name}</strong>
                  <span className="tl-list__meta">{s.specialty.description}</span>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      ) : null}

      <Card label="Verified qualifications">
        <CardHeader>
          <strong>Verified qualifications</strong>
        </CardHeader>
        <CardBody>
          <p className="tl-muted">
            Each of these has been checked against the issuing council&rsquo;s register.
          </p>
          <ul className="tl-list">
            {profile.qualifications.map((q) => (
              <li key={q.id}>
                <div className="tl-card__title-row">
                  <strong>
                    {q.degree} — {q.institution}
                  </strong>
                  <Badge tone="success">Verified</Badge>
                </div>
                <span className="tl-list__meta">
                  {q.year}
                  {q.registrationBody ? ` · ${q.registrationBody}` : ''}
                </span>
              </li>
            ))}
          </ul>
        </CardBody>
      </Card>

      {profile.consultationFeeMinor !== null && profile.consultationCurrency ? (
        <Card label="Consultation fee">
          <CardHeader>
            <strong>Consultation fee</strong>
          </CardHeader>
          <CardBody>
            <p style={{ fontSize: 'var(--tl-text-xl)', margin: 0 }}>
              {formatMoney(
                money(BigInt(profile.consultationFeeMinor), profile.consultationCurrency),
                'en-IN',
              )}
            </p>
          </CardBody>
        </Card>
      ) : null}

      {/*
       * PRICES, WITH THEIR PROVENANCE.
       *
       * Each figure is this dentist's own. The market range is shown beside it,
       * explicitly labelled, and never in place of it — a suggested range
       * rendered as a clinic's price is a number no dentist agreed to
       * (specification §13, Constitution P9).
       *
       * The section is absent entirely when nothing is published, rather than
       * showing an empty table: "no prices listed" and "this dentist is free"
       * must not look alike.
       */}
      {pricesByCategory.size > 0 ? (
        <Card label="Treatment prices">
          <CardHeader>
            <div className="tl-card__title-row">
              <strong>Clinic prices</strong>
              <Badge tone="neutral">Set by this clinic</Badge>
            </div>
          </CardHeader>
          <CardBody>
            {[...pricesByCategory.entries()].map(([categoryName, rows]) => (
              <section key={categoryName} className="tl-publicprices__group">
                <h2 className="tl-publicprices__category">{categoryName}</h2>
                <ul className="tl-publicprices__list">
                  {rows.map((row) => {
                    const suggested = describeSuggestedRange({
                      minMinor: row.service.suggestedMinMinor,
                      maxMinor: row.service.suggestedMaxMinor,
                      currency: row.service.suggestedCurrency ?? 'INR',
                      openEnded: row.service.suggestedIsOpenEnded,
                      isCustomQuote: row.service.isCustomQuote,
                    });

                    return (
                      <li key={row.id} className="tl-publicprices__item">
                        <div className="tl-publicprices__head">
                          <h3 className="tl-publicprices__name">{row.service.name}</h3>
                          {suggested ? (
                            <p className="tl-publicprices__suggested">
                              {suggested.label} {suggested.value}
                            </p>
                          ) : null}
                        </div>

                        {(() => {
                          const description = resolveDescription({
                            dentistService: row.customDescription,
                            masterService: row.service.description,
                          });
                          return description.text ? (
                            <p className="tl-publicprices__description">{description.text}</p>
                          ) : null;
                        })()}

                        <dl className="tl-publicprices__prices">
                          {row.variantPrices
                            .filter((price) => price.isEnabled)
                            .map((price) => {
                              const display = describePrice({
                                minMinor: price.minMinor,
                                maxMinor: price.maxMinor,
                                actualMinor: price.actualMinor,
                                discountedMinor: price.discountedMinor,
                                packageMinor: price.packageMinor,
                                currency: price.currency,
                                isCustomQuote: price.isCustomQuote,
                                unitLabel: price.unit.shortLabel,
                              });

                              const variantDescription = resolveDescription({
                                dentistVariant: price.customDescription,
                                masterVariant: price.variant?.description,
                              });

                              return (
                                <div key={price.id}>
                                  <dt>
                                    {price.variant?.name ?? 'Price'}
                                    {variantDescription.text ? (
                                      <span className="tl-publicprices__variant-note">
                                        {variantDescription.text}
                                      </span>
                                    ) : null}
                                  </dt>
                                  <dd>
                                    <span className="tl-price">
                                      <strong>{display.primary ?? display.text}</strong>
                                      {display.rangeEnd ? (
                                        <>
                                          <span aria-hidden="true">–</span>
                                          <span className="tl-visually-hidden">to</span>
                                          <strong>{display.rangeEnd}</strong>
                                          {display.openEnded ? '+' : null}
                                        </>
                                      ) : null}
                                      {display.strikethrough ? (
                                        <s className="tl-price__was">
                                          <span className="tl-visually-hidden">was </span>
                                          {display.strikethrough}
                                        </s>
                                      ) : null}
                                      {display.unitLabel ? (
                                        <span className="tl-price__unit">{display.unitLabel}</span>
                                      ) : null}
                                    </span>
                                  </dd>
                                </div>
                              );
                            })}
                        </dl>

                        {row.note ? <p className="tl-publicprices__note">{row.note}</p> : null}
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))}

            <p className="tl-muted" style={{ fontSize: 'var(--tl-text-sm)', marginBlockEnd: 0 }}>
              Prices are set by this clinic and may change. A suggested range, where shown, is a
              market reference for India and not this clinic&rsquo;s price. Confirm the final cost
              with the clinic before treatment.
            </p>
          </CardBody>
        </Card>
      ) : null}

      {/*
       * Booking is Phase 4. Saying so is better than a button that does
       * nothing, and far better than one that appears to book an appointment.
       */}
      <Card label="Booking">
        <CardHeader>
          <div className="tl-card__title-row">
            <strong>Booking</strong>
            <Badge tone="warning">Not available yet</Badge>
          </div>
        </CardHeader>
        <CardBody>
          <p className="tl-muted" style={{ margin: 0 }}>
            Online appointment booking is not built yet. It arrives in Phase 4, together with
            availability and reminders.
          </p>
        </CardBody>
      </Card>
    </div>
  );
}

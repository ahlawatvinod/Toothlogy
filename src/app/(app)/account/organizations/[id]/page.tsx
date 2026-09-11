/**
 * TL-PAGE-ORG-DETAIL-001 — /account/organizations/:id
 *
 * Authorization happens HERE, on the server, before any data is read.
 * `currentUserCan` is checked against this specific organization, so a member
 * of a different clinic gets a 404 rather than another practice's staff list.
 *
 * A 404 rather than a 403 is deliberate: telling an unauthorised caller that
 * the organization exists is itself a disclosure.
 *
 * Every date is formatted here, in the viewer's locale and timezone, so server
 * and browser render identical text. Management controls are rendered only for
 * callers holding the matching permission — a UX affordance; each API call
 * re-checks it.
 */

import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { currentPrincipal, currentUserCan } from '@/platform/auth/server';
import { isAuthenticated } from '@/platform/rbac';
import { db } from '@/platform/db/client';
import { getOrganization } from '@/platform/organizations/service';
import { listLocations } from '@/platform/organizations/locations';
import { listOrganizationOfferings } from '@/platform/organizations/offerings';
import { listClosures, localDate } from '@/platform/organizations/location-management';
import { organizationVerificationHistory } from '@/platform/organizations/management';
import { TREATMENT_CATEGORY_LABELS } from '@/platform/catalogue/treatments';
import { FACILITY_BY_KEY } from '@/platform/catalogue/facilities';
import { formatMoney } from '@/platform/money';
import { Badge, Card, CardBody, CardHeader, EmptyState, type BadgeTone } from '@/design-system';
import { InviteMemberForm } from './invite-member-form';
import { MembersPanel } from './members-panel';
import { PracticeClaimsPanel } from './practice-claims-panel';
import { ServicesPanel } from './services-panel';
import { LocationEditor } from './location-editor';
import { VerificationPanel } from './verification-panel';
import { NewLocationForm } from './new-location-form';
import { OrganizationProfilePanel } from './organization-profile-panel';
import { LocationPhotos } from './location-photos';
import { COUNTRIES, TIMEZONES } from '@/registry/globalization';

export const metadata: Metadata = {
  title: 'Organization',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function formatMinutes(minutes: number): string {
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}

type MoneyCurrency = Parameters<typeof formatMoney>[0]['currency'];

export default async function OrganizationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const principal = await currentPrincipal();
  if (!isAuthenticated(principal)) notFound();

  // The cross-tenant check. Without it, any signed-in user could read any
  // organization by guessing an id.
  if (!(await currentUserCan('tl.core.organization.read', { organizationId: id }))) notFound();

  const [canManage, canConfirm, canManageServices, canReadRecords, canHire, canSeeAnalytics, canSeeDevices] = await Promise.all([
    currentUserCan('tl.core.organization.manage', { organizationId: id }),
    currentUserCan('tl.clinic.practice.confirm', { organizationId: id }),
    currentUserCan('tl.clinic.service.manage', { organizationId: id }),
    currentUserCan('tl.records.record.read', { organizationId: id }),
    currentUserCan('tl.careers.posting.manage', { organizationId: id }),
    currentUserCan('tl.analytics.practice.read', { organizationId: id }),
    currentUserCan('tl.iot.device.read', { organizationId: id }),
  ]);

  const [organization, locations, history, practices, offerings, treatments, viewer] = await Promise.all([
    getOrganization(id),
    listLocations(id),
    organizationVerificationHistory(id),
    db().dentistPractice.findMany({
      where: { location: { organizationId: id, deletedAt: null } },
      include: {
        location: { select: { name: true } },
        dentistProfile: { select: { isVerified: true, user: { select: { displayName: true } } } },
      },
      orderBy: [{ isConfirmed: 'asc' }, { createdAt: 'desc' }],
    }),
    listOrganizationOfferings(id),
    db().treatment.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: 'asc' },
      select: { key: true, name: true, category: true },
    }),
    db().user.findUnique({ where: { id: principal.userId }, select: { locale: true, timezone: true } }),
  ]);

  const locale = viewer?.locale ?? 'en-IN';
  const timeZone = viewer?.timezone ?? organization.timezone;
  const formatDate = (d: Date) => new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone }).format(d);
  // Closure dates are calendar days, not instants: formatted in UTC so a day
  // never shifts by the viewer's offset.
  const formatDay = (iso: string) =>
    new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(`${iso}T00:00:00Z`));

  const fractionDigits =
    new Intl.NumberFormat('en', { style: 'currency', currency: organization.currency }).resolvedOptions()
      .maximumFractionDigits ?? 2;
  const money = (minor: number, currency: string) =>
    formatMoney({ amountMinor: BigInt(minor), currency: currency as MoneyCurrency }, locale);

  // Reference lists for the branch forms. The organization's own values are
  // always offered, even if the registry does not list them.
  const timezones = [
    ...(TIMEZONES.some((t) => t.id === organization.timezone) ? [] : [{ id: organization.timezone, label: organization.timezone }]),
    ...TIMEZONES.map((t) => ({ id: t.id, label: t.label })),
  ];
  const countries = [
    ...(COUNTRIES.some((c) => c.code === organization.countryCode && c.enabled)
      ? []
      : [{ code: organization.countryCode, name: organization.countryCode }]),
    ...COUNTRIES.filter((c) => c.enabled).map((c) => ({ code: c.code, name: c.name })),
  ];

  const closuresByLocation = new Map(
    await Promise.all(
      locations.map(async (l) => [l.id, await listClosures(l.id, localDate(l.timezone))] as const),
    ),
  );

  // --- Verification state, said plainly --------------------------------------
  const latest = history[0];
  const underReview = latest && (latest.status === 'PENDING' || latest.status === 'IN_REVIEW');
  let verification: { tone: BadgeTone; label: string; detail: string };
  if (organization.verifiedAt) {
    verification = {
      tone: 'success',
      label: 'Verified',
      detail: `Registration checked on ${formatDate(organization.verifiedAt)}${
        organization.verificationExpires ? `, valid until ${formatDate(organization.verificationExpires)}` : ''
      }. Patients see a Verified badge on your branches.`,
    };
  } else if (underReview) {
    verification = {
      tone: 'info',
      label: 'Under review',
      detail: `Submitted on ${formatDate(latest.submittedAt)}. A reviewer is checking your documents against the issuing register.`,
    };
  } else if (latest?.status === 'REJECTED') {
    verification = {
      tone: 'danger',
      label: 'Not approved',
      detail: `The last submission was not approved: ${latest.decisionReason ?? 'no reason recorded'}. Correct it and submit again.`,
    };
  } else if (latest?.status === 'REVOKED') {
    verification = {
      tone: 'danger',
      label: 'Verification withdrawn',
      detail: latest.revocationReason ?? 'Verification was withdrawn. Submit current documents to be verified again.',
    };
  } else {
    verification = {
      tone: 'warning',
      label: 'Not verified',
      detail:
        'Submit your registration certificate so patients can see Toothlogy has checked it. Until then your branches show no Verified badge.',
    };
  }

  const priceLabel = (o: (typeof offerings)[number]) => {
    if (o.priceMinor === null || !o.currency) return 'Price on consultation';
    const from = money(o.priceMinor, o.currency);
    return o.priceMaxMinor !== null && o.priceMaxMinor > o.priceMinor ? `${from} – ${money(o.priceMaxMinor, o.currency)}` : from;
  };

  return (
    <div className="tl-page">
      <nav aria-label="Breadcrumb" className="tl-breadcrumb">
        <Link href="/account/organizations">Organizations</Link>
        <span aria-hidden="true"> / </span>
        <span aria-current="page">{organization.name}</span>
      </nav>

      <header className="tl-page__header">
        <div className="tl-card__title-row">
          <h1>{organization.name}</h1>
          <Badge tone={verification.tone}>{verification.label}</Badge>
        </div>
        <p className="tl-page__lead">
          {organization.type.toLowerCase()} · {organization.countryCode} · {organization.currency} · /{organization.slug}
        </p>
      </header>

      <Card label="Equipment register">
        <CardHeader>
          <strong>Equipment register</strong>
        </CardHeader>
        <CardBody>
          <p style={{ marginTop: 0 }}>Your equipment, warranties and maintenance contracts, with reminders before they end.</p>
          <Link className="tl-button tl-button--sm tl-button--secondary" href={`/account/organizations/${id}/equipment`}>
            <span>Equipment register</span>
          </Link>
        </CardBody>
      </Card>

      {canManage ? (
        <Card label="Prime">
          <CardHeader>
            <strong>Prime</strong>
          </CardHeader>
          <CardBody>
            <p style={{ marginTop: 0 }}>A paid membership from your lead wallet: bonus free leads, a labelled badge, priority support. It never changes your search ranking.</p>
            <div className="tl-inline" style={{ flexWrap: 'wrap' }}>
              <Link className="tl-button tl-button--sm tl-button--secondary" href={`/account/organizations/${id}/prime`}>
                <span>Prime membership</span>
              </Link>
              <Link className="tl-button tl-button--sm tl-button--ghost" href={`/account/organizations/${id}/enterprise`}>
                <span>Enterprise agreement</span>
              </Link>
            </div>
          </CardBody>
        </Card>
      ) : null}

      {['SUPPLIER', 'MANUFACTURER', 'DISTRIBUTOR', 'WHOLESALER', 'RETAILER', 'LABORATORY'].includes(organization.type) ? (
        <Card label="Marketplace">
          <CardHeader>
            <strong>Marketplace</strong>
          </CardHeader>
          <CardBody>
            <p style={{ marginTop: 0 }}>Your catalogue appears on your marketplace page; buyers’ quote requests arrive under Quotes.</p>
            <div className="tl-inline" style={{ flexWrap: 'wrap' }}>
              {canManage ? (
                <Link className="tl-button tl-button--sm tl-button--primary" href={`/account/organizations/${id}/business`}>
                  <span>Catalogue</span>
                </Link>
              ) : null}
              <Link className="tl-button tl-button--sm tl-button--secondary" href={`/account/organizations/${id}/quotes`}>
                <span>Quotes</span>
              </Link>
              <Link className="tl-button tl-button--sm tl-button--secondary" href={`/account/organizations/${id}/orders`}>
                <span>Orders</span>
              </Link>
              <Link className="tl-button tl-button--sm tl-button--secondary" href={`/account/organizations/${id}/service-contracts`}>
                <span>Service contracts</span>
              </Link>
              <Link className="tl-button tl-button--sm tl-button--ghost" href={`/suppliers/${organization.slug}`}>
                <span>Public page</span>
              </Link>
            </div>
          </CardBody>
        </Card>
      ) : null}

      {organization.type === 'COLLEGE' ? (
        <Card label="College">
          <CardHeader>
            <strong>College</strong>
          </CardHeader>
          <CardBody>
            <p style={{ marginTop: 0 }}>Your academic profile, courses and admission windows appear on your public college page; students’ enquiries arrive under Admissions.</p>
            <div className="tl-inline" style={{ flexWrap: 'wrap' }}>
              {canManage ? (
                <Link className="tl-button tl-button--sm tl-button--primary" href={`/account/organizations/${id}/education`}>
                  <span>Courses</span>
                </Link>
              ) : null}
              <Link className="tl-button tl-button--sm tl-button--secondary" href={`/account/organizations/${id}/admissions`}>
                <span>Admissions</span>
              </Link>
              {canManage ? (
                <Link className="tl-button tl-button--sm tl-button--secondary" href={`/account/organizations/${id}/faculty`}>
                  <span>Faculty</span>
                </Link>
              ) : null}
              {canManage ? (
                <Link className="tl-button tl-button--sm tl-button--secondary" href={`/account/organizations/${id}/students`}>
                  <span>Students</span>
                </Link>
              ) : null}
              <Link className="tl-button tl-button--sm tl-button--ghost" href={`/colleges/${organization.slug}`}>
                <span>Public page</span>
              </Link>
            </div>
          </CardBody>
        </Card>
      ) : null}

      {canSeeDevices ? (
        <Card label="Equipment">
          <CardHeader>
            <strong>Equipment</strong>
          </CardHeader>
          <CardBody>
            <p style={{ marginTop: 0 }}>Connected devices — autoclaves, chairs, compressors — their readings, and alerts when a reading leaves its limits.</p>
            <Link className="tl-button tl-button--sm tl-button--secondary" href={`/account/organizations/${id}/devices`}>
              <span>Equipment</span>
            </Link>
          </CardBody>
        </Card>
      ) : null}

      {canSeeAnalytics ? (
        <Card label="Analytics">
          <CardHeader>
            <strong>Analytics</strong>
          </CardHeader>
          <CardBody>
            <p style={{ marginTop: 0 }}>Bookings and what became of them, leads and what they cost, reviews and views — from your own records.</p>
            <Link className="tl-button tl-button--sm tl-button--secondary" href={`/account/organizations/${id}/analytics`}>
              <span>Analytics</span>
            </Link>
          </CardBody>
        </Card>
      ) : null}

      {canHire ? (
        <Card label="Careers">
          <CardHeader>
            <strong>Careers</strong>
          </CardHeader>
          <CardBody>
            <p style={{ marginTop: 0 }}>Post jobs and internships on Toothlogy careers and work the applications. Publishing needs a verified organization.</p>
            <Link className="tl-button tl-button--sm tl-button--secondary" href={`/account/organizations/${id}/careers`}>
              <span>Careers</span>
            </Link>
          </CardBody>
        </Card>
      ) : null}

      {canReadRecords ? (
        <Card label="Patients’ records">
          <CardHeader>
            <strong>Patients’ records</strong>
          </CardHeader>
          <CardBody>
            <p style={{ marginTop: 0 }}>Dental records your patients have shared with you, and patients you may ask. They decide; each time you look, they can see it.</p>
            <Link className="tl-button tl-button--sm tl-button--secondary" href={`/account/organizations/${id}/patients`}>
              <span>Patients’ records</span>
            </Link>
          </CardBody>
        </Card>
      ) : null}

      {canManage ? (
        <Card label="Profile">
          <CardHeader>
            <strong>Profile</strong>
          </CardHeader>
          <CardBody>
            <OrganizationProfilePanel
              organizationId={id}
              profile={{
                name: organization.name,
                description: organization.description,
                website: organization.website,
                phone: organization.phone,
                email: organization.email,
                taxIdentifier: organization.taxIdentifier,
                logoFileId: organization.logoFileId,
                verified: organization.verifiedAt !== null,
              }}
            />
          </CardBody>
        </Card>
      ) : null}

      <Card label="Verification">
        <CardHeader>
          <strong>Verification</strong>
        </CardHeader>
        <CardBody>
          <p style={{ marginTop: 0 }}>{verification.detail}</p>
          {canManage && !organization.verifiedAt && !underReview ? <VerificationPanel organizationId={id} registrationNumber={organization.registrationNumber} /> : null}
        </CardBody>
      </Card>

      <Card label="Members">
        <CardHeader>
          <strong>Members</strong>
        </CardHeader>
        <CardBody>
          <MembersPanel
            organizationId={id}
            organizationName={organization.name}
            canManage={canManage}
            members={organization.members.map((m) => ({
              userId: m.user.id,
              name: m.user.displayName ?? m.user.email ?? 'Member',
              email: m.user.email,
              roleKey: m.roleKey,
              joinedLabel: formatDate(m.joinedAt),
              isOwner: organization.ownerUserId === m.user.id,
              isYou: m.user.id === principal.userId,
            }))}
          />
        </CardBody>
      </Card>

      {canManage ? <InviteMemberForm organizationId={id} /> : null}

      <Card label="Dentists practising here">
        <CardHeader>
          <strong>Dentists practising here</strong>
        </CardHeader>
        <CardBody>
          <PracticeClaimsPanel
            organizationId={id}
            canConfirm={canConfirm}
            claims={practices.map((p) => ({
              id: p.id,
              dentistName: p.dentistProfile.user.displayName ?? 'A dentist',
              dentistVerified: p.dentistProfile.isVerified,
              locationName: p.location.name,
              isConfirmed: p.isConfirmed,
            }))}
          />
        </CardBody>
      </Card>

      <Card label="Services and prices">
        <CardHeader>
          <strong>Services and prices</strong>
        </CardHeader>
        <CardBody>
          <ServicesPanel
            organizationId={id}
            currency={organization.currency}
            fractionDigits={fractionDigits}
            canManage={canManageServices}
            locations={locations.map((l) => ({ id: l.id, name: l.name, homeVisit: l.homeVisitRadiusKm !== null }))}
            treatments={treatments.map((t) => ({
              key: t.key,
              name: t.name,
              categoryLabel: (TREATMENT_CATEGORY_LABELS as Record<string, string>)[t.category] ?? t.category,
            }))}
            services={offerings.map((o) => ({
              id: o.id,
              name: o.name,
              locationName: o.location.name,
              dentistName: o.dentistProfile?.user.displayName ?? null,
              priceLabel: priceLabel(o),
              durationMinutes: o.durationMinutes,
              appointmentTypes: o.appointmentTypes,
              requiresConsultation: o.requiresConsultation,
              isActive: o.isActive,
            }))}
          />
        </CardBody>
      </Card>

      <Card label="Locations">
        <CardHeader>
          <strong>Locations</strong>
        </CardHeader>
        <CardBody>
          {locations.length === 0 ? (
            <EmptyState
              title="No locations yet"
              description="Add a branch with its address and opening hours so patients can find it."
            />
          ) : (
            <ul className="tl-list">
              {locations.map((l) => {
                const closures = closuresByLocation.get(l.id) ?? [];
                return (
                  <li key={l.id} className="tl-stack">
                    <div className="tl-card__title-row">
                      <strong>{l.name}</strong>
                      {l.status === 'TEMPORARILY_CLOSED' ? (
                        <Badge tone="warning">Temporarily closed</Badge>
                      ) : l.latitude !== null && l.longitude !== null ? (
                        <Badge tone="success">On the map</Badge>
                      ) : (
                        <Badge tone="warning">No coordinates — not in distance search</Badge>
                      )}
                    </div>
                    <span className="tl-list__meta">
                      {l.address ? `${l.address.lines.join(', ')} · ` : ''}
                      {l.timezone}
                    </span>
                    <span className="tl-list__meta">
                      {l.businessHours.length > 0
                        ? l.businessHours
                            .map((h) => `${DAY_NAMES[h.dayOfWeek]} ${formatMinutes(h.opensAtMinutes)}–${formatMinutes(h.closesAtMinutes)}`)
                            .join(' · ')
                        : 'No opening hours set'}
                    </span>
                    {l.facilities.length > 0 ? (
                      <span className="tl-list__meta">
                        {l.facilities.map((f) => FACILITY_BY_KEY.get(f)?.label ?? f).join(' · ')}
                      </span>
                    ) : null}
                    {canManage ? (
                      <LocationPhotos organizationId={id} locationId={l.id} locationName={l.name} photoFileIds={l.photoFileIds} />
                    ) : null}
                    {canManage ? (
                      <LocationEditor
                        organizationId={id}
                        countries={countries}
                        location={{
                          id: l.id,
                          name: l.name,
                          status: l.status,
                          phone: l.phone,
                          email: l.email,
                          address: l.address
                            ? {
                                line1: l.address.lines[0] ?? '',
                                line2: l.address.lines.slice(1).join(', '),
                                locality: l.address.locality ?? '',
                                region: l.address.regionName ?? '',
                                postalCode: l.address.postalCode ?? '',
                                countryCode: l.address.countryCode,
                              }
                            : null,
                          // Decimal in the database; numbers across the client boundary.
                          latitude: l.latitude === null ? null : Number(l.latitude),
                          longitude: l.longitude === null ? null : Number(l.longitude),
                          hours: l.businessHours.map((h) => ({
                            dayOfWeek: h.dayOfWeek,
                            opensAtMinutes: h.opensAtMinutes,
                            closesAtMinutes: h.closesAtMinutes,
                          })),
                          facilities: l.facilities,
                          chairs: l.chairs,
                          wheelchairAccessible: l.wheelchairAccessible,
                          parkingAvailable: l.parkingAvailable,
                          emergencyAvailable: l.emergencyAvailable,
                          homeVisitRadiusKm: l.homeVisitRadiusKm,
                          today: localDate(l.timezone),
                          closures: closures.map((c) => ({
                            id: c.id,
                            reason: c.reason,
                            label: c.startsOn === c.endsOn ? formatDay(c.startsOn) : `${formatDay(c.startsOn)} – ${formatDay(c.endsOn)}`,
                          })),
                        }}
                      />
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
        </CardBody>
      </Card>

      {canManage ? (
        <NewLocationForm
          organizationId={id}
          defaultTimezone={organization.timezone}
          defaultCountry={organization.countryCode}
          timezones={timezones}
          countries={countries}
          hasPrimary={locations.some((l) => l.isPrimary)}
        />
      ) : null}
    </div>
  );
}

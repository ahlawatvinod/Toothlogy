/**
 * TL-PAGE-ORG-ANALYTICS-001 — /account/organizations/:id/analytics
 *
 * The practice's numbers for the last 7, 30 or 90 days, from its records:
 * bookings and what became of them, leads and what they cost, reviews,
 * profile and page views, most-booked services. A rate with nothing to
 * divide by shows "—". 404 without tl.analytics.practice.read.
 */

import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { currentPrincipal } from '@/platform/auth/server';
import { isAuthenticated } from '@/platform/rbac';
import { practiceAnalytics, windowDays, WINDOWS } from '@/platform/analytics/dashboards';
import { formatMoney } from '@/platform/money';
import { isAppError } from '@/platform/kernel/errors';
import { Card, CardBody, CardHeader, EmptyState } from '@/design-system';
import { BarChart, Figure } from '@/components/analytics/bar-chart';

export const metadata: Metadata = { title: 'Analytics', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

const percent = (r: number | null) => (r === null ? null : `${Math.round(r * 100)}%`);
const stars = (avg: number | null, n: number) => (avg === null || n === 0 ? null : `${avg.toFixed(1)} ★`);

export default async function PracticeAnalyticsPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { id } = await params;
  const days = windowDays((await searchParams).days);
  const principal = await currentPrincipal();
  if (!isAuthenticated(principal)) notFound();
  const data = await practiceAnalytics(principal, id, days).catch((error) => {
    if (isAppError(error) && error.code === 'NOT_FOUND') return null;
    throw error;
  });
  if (!data) notFound();
  const { appointments: a, leads: l, reviews: r } = data;
  const rupees = formatMoney({ amountMinor: BigInt(data.spendMinor), currency: data.spendCurrency }, 'en-IN');

  return (
    <div className="tl-page">
      <nav aria-label="Breadcrumb" className="tl-breadcrumb">
        <Link href={`/account/organizations/${id}`}>{data.organization.name}</Link>
        <span aria-hidden="true"> / </span>
        <span aria-current="page">Analytics</span>
      </nav>
      <header className="tl-page__header">
        <h1>Analytics</h1>
        <p className="tl-page__lead">Counted from your own appointments, leads, charges and reviews. No patient is identified here.</p>
        <nav aria-label="Period" className="tl-inline" style={{ flexWrap: 'wrap' }}>
          {WINDOWS.map((w) => (
            <Link key={w} href={`/account/organizations/${id}/analytics?days=${w}`} aria-current={w === days ? 'page' : undefined} className={`tl-button tl-button--sm ${w === days ? 'tl-button--primary' : 'tl-button--ghost'}`}>
              <span>Last {w} days</span>
            </Link>
          ))}
        </nav>
      </header>

      <Card label="Bookings">
        <CardHeader>
          <strong>Bookings</strong>
        </CardHeader>
        <CardBody>
          <div className="tl-stack">
            <dl className="tl-kv">
              <Figure label="Booked" value={a.booked} hint="made in the period" />
              <Figure label="Completed" value={a.completed} hint="visits in the period" />
              <Figure label="No-shows" value={a.noShow} />
              <Figure label="Cancelled" value={a.cancelled} />
              <Figure label="Attended" value={percent(a.attendedRate)} hint="of completed and no-show visits" />
            </dl>
            <BarChart label="Bookings made" data={data.bookingsByDay} />
          </div>
        </CardBody>
      </Card>

      <Card label="Leads">
        <CardHeader>
          <strong>Leads</strong>
        </CardHeader>
        <CardBody>
          <dl className="tl-kv">
            <Figure label="Enquiries" value={l.created} />
            <Figure label="Qualified" value={l.qualified} />
            <Figure label="Became a booking" value={l.booked} hint={percent(l.created ? l.booked / l.created : null) ?? undefined} />
            <Figure label="Treated" value={l.converted} />
            <Figure label="Free" value={l.free} hint="inside your free allowance" />
            <Figure label="Charged" value={l.charged} />
            <Figure label="Refunded" value={l.refunded} />
            <Figure label="Waiting for funds" value={l.waitingForFunds} />
            <Figure label="Spent on leads" value={rupees} hint="charges less refunds" />
          </dl>
          <p className="tl-muted" style={{ marginBottom: 0 }}>
            <Link href="/account/practice/leads">Leads</Link> · <Link href={`/account/organizations/${id}/billing`}>Billing</Link>
          </p>
        </CardBody>
      </Card>

      <Card label="Reviews and views">
        <CardHeader>
          <strong>Reviews and views</strong>
        </CardHeader>
        <CardBody>
          <dl className="tl-kv">
            <Figure label="New reviews" value={r.inWindow} hint={stars(r.averageInWindow, r.inWindow) ?? undefined} />
            <Figure label="All reviews" value={r.total} hint={stars(r.average, r.total) ?? undefined} />
            <Figure label="Dentist profile views" value={data.views.profile} />
            <Figure label="Clinic page views" value={data.views.clinic} />
          </dl>
          <p className="tl-muted" style={{ marginBottom: 0 }}>
            Views are counted from when view recording began; signed-in visitors are told apart only if they agreed to analytics, everyone else is counted anonymously.
          </p>
        </CardBody>
      </Card>

      <Card label="Most-booked services">
        <CardHeader>
          <strong>Most-booked services</strong>
        </CardHeader>
        <CardBody>
          {data.topServices.length === 0 ? (
            <EmptyState title="No bookings in this period" description="Services appear here as patients book them." />
          ) : (
            <ol aria-label="Most-booked services">
              {data.topServices.map((s) => (
                <li key={s.name}>
                  {s.name} — {s.count}
                </li>
              ))}
            </ol>
          )}
        </CardBody>
      </Card>
    </div>
  );
}

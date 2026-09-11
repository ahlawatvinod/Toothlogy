/**
 * TL-PAGE-DENTIST-ANALYTICS-001 — /account/dentist-profile/analytics
 *
 * The dentist's own numbers across the practices they work at, for the last
 * 7, 30 or 90 days, counted from appointments, reviews and profile views. Lead
 * charges are the practice's and appear on its analytics, not here. 404 for
 * anyone without a dentist profile.
 */

import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { currentPrincipal } from '@/platform/auth/server';
import { isAuthenticated } from '@/platform/rbac';
import { dentistAnalytics, windowDays, WINDOWS } from '@/platform/analytics/dashboards';
import { isAppError } from '@/platform/kernel/errors';
import { Card, CardBody, CardHeader, EmptyState } from '@/design-system';
import { BarChart, Figure } from '@/components/analytics/bar-chart';

export const metadata: Metadata = { title: 'Your numbers', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

const percent = (r: number | null) => (r === null ? null : `${Math.round(r * 100)}%`);
const stars = (avg: number | null, n: number) => (avg === null || n === 0 ? null : `${avg.toFixed(1)} ★`);

export default async function DentistAnalyticsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const days = windowDays((await searchParams).days);
  const principal = await currentPrincipal();
  if (!isAuthenticated(principal)) redirect('/login?next=%2Faccount%2Fdentist-profile%2Fanalytics');
  const data = await dentistAnalytics(principal, days).catch((error) => {
    if (isAppError(error) && error.code === 'NOT_FOUND') return null;
    throw error;
  });
  if (!data) notFound();
  const { appointments: a, reviews: r } = data;

  return (
    <div className="tl-page">
      <nav aria-label="Breadcrumb" className="tl-breadcrumb">
        <Link href="/account/dentist-profile">Your dentist profile</Link>
        <span aria-hidden="true"> / </span>
        <span aria-current="page">Your numbers</span>
      </nav>
      <header className="tl-page__header">
        <h1>Your numbers</h1>
        <p className="tl-page__lead">
          Across the {data.practices === 1 ? 'practice' : `${data.practices} practices`} you work at, counted from your appointments, reviews
          and profile views. No patient is identified here.
        </p>
        <nav aria-label="Period" className="tl-inline" style={{ flexWrap: 'wrap' }}>
          {WINDOWS.map((w) => (
            <Link key={w} href={`/account/dentist-profile/analytics?days=${w}`} aria-current={w === days ? 'page' : undefined} className={`tl-button tl-button--sm ${w === days ? 'tl-button--primary' : 'tl-button--ghost'}`}>
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

      <Card label="Reviews and views">
        <CardHeader>
          <strong>Reviews and views</strong>
        </CardHeader>
        <CardBody>
          <dl className="tl-kv">
            <Figure label="New reviews" value={r.inWindow} hint={stars(r.averageInWindow, r.inWindow) ?? undefined} />
            <Figure label="All reviews" value={r.total} hint={stars(r.average, r.total) ?? undefined} />
            <Figure label="Profile views" value={data.profileViews} />
          </dl>
          <p className="tl-muted" style={{ marginBottom: 0 }}>
            Views are counted from when view recording began; signed-in visitors are told apart only if they agreed to analytics.{' '}
            <Link href={`/dentists/${data.profile.slug}`}>Your public profile</Link>
          </p>
        </CardBody>
      </Card>

      <Card label="Most-booked services">
        <CardHeader>
          <strong>Most-booked services</strong>
        </CardHeader>
        <CardBody>
          {data.topServices.length === 0 ? (
            <EmptyState title="No bookings in this period" description="Services appear here as patients book them with you." />
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

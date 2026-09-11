/**
 * TL-PAGE-ADMIN-ANALYTICS-001 — /admin/analytics
 *
 * Platform-wide numbers for operators, from the records: people, trust
 * (verified dentists and organizations), care (bookings, visits, searches,
 * shared records), lead revenue, community and support. 404 without
 * tl.analytics.platform.read.
 */

import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { currentPrincipal } from '@/platform/auth/server';
import { can, isAuthenticated } from '@/platform/rbac';
import { PLATFORM, platformAnalytics, windowDays, WINDOWS } from '@/platform/analytics/dashboards';
import { formatMoney } from '@/platform/money';
import { Card, CardBody, CardHeader } from '@/design-system';
import { BarChart, Figure } from '@/components/analytics/bar-chart';

export const metadata: Metadata = { title: 'Platform analytics (staff)', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

export default async function PlatformAnalyticsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const principal = await currentPrincipal();
  if (!isAuthenticated(principal)) redirect('/login?next=/admin/analytics');
  if (!can(principal, PLATFORM)) notFound();
  const days = windowDays((await searchParams).days);
  const d = await platformAnalytics(principal, days);
  // One figure per currency — never converted, never summed across currencies.
  const approx = d.revenue.approximate;
  const revenue =
    (d.revenue.byCurrency.length ? d.revenue.byCurrency.map((r) => formatMoney({ amountMinor: BigInt(r.minor), currency: r.currency }, 'en-IN')).join(' · ') : 'None yet') +
    // Across currencies only approximately, at rates staff recorded — never a conversion of anyone's money.
    (approx === null ? '' : approx.complete ? ` (about ${formatMoney({ amountMinor: approx.minor, currency: approx.currency }, 'en-IN')} in all, approximate, at recorded exchange rates)` : ` (no total: no exchange rate recorded for ${approx.missing.join(', ')})`);

  return (
    <div className="tl-container tl-page" style={{ maxWidth: '60rem' }}>
      <header className="tl-page__header">
        <h1>Platform analytics (staff)</h1>
        <p className="tl-page__lead">Totals from the records. No person is identified.</p>
        <nav aria-label="Period" className="tl-inline" style={{ flexWrap: 'wrap' }}>
          {WINDOWS.map((w) => (
            <Link key={w} href={`/admin/analytics?days=${w}`} aria-current={w === days ? 'page' : undefined} className={`tl-button tl-button--sm ${w === days ? 'tl-button--primary' : 'tl-button--ghost'}`}>
              <span>Last {w} days</span>
            </Link>
          ))}
        </nav>
      </header>
      <Card label="People and trust">
        <CardHeader>
          <strong>People and trust</strong>
        </CardHeader>
        <CardBody>
          <div className="tl-stack">
            <dl className="tl-kv">
              <Figure label="Accounts" value={d.people.total} hint={`${d.people.new} new`} />
              <Figure label="Verified dentists" value={d.trust.dentistsVerified} hint={`${d.trust.dentistsVerifiedNew} newly verified`} />
              <Figure label="Verified organizations" value={d.trust.organizationsVerified} />
            </dl>
            <BarChart label="New accounts" data={d.signupsByDay} />
          </div>
        </CardBody>
      </Card>
      <Card label="Care">
        <CardHeader>
          <strong>Care</strong>
        </CardHeader>
        <CardBody>
          <div className="tl-stack">
            <dl className="tl-kv">
              <Figure label="Bookings made" value={d.care.appointmentsBooked} />
              <Figure label="Visits completed" value={d.care.appointmentsCompleted} />
              <Figure label="Searches" value={d.care.searches} />
              <Figure label="Records shared now" value={d.care.recordShares} hint="active grants" />
            </dl>
            <BarChart label="Bookings made" data={d.bookingsByDay} />
          </div>
        </CardBody>
      </Card>
      <Card label="Leads and revenue">
        <CardHeader>
          <strong>Leads and revenue</strong>
        </CardHeader>
        <CardBody>
          <dl className="tl-kv">
            <Figure label="Leads" value={d.revenue.leadsCreated} />
            <Figure label="Charged" value={d.revenue.leadsCharged} />
            <Figure label="Lead revenue" value={revenue} hint="charges less refunds, including tax, per currency" />
          </dl>
        </CardBody>
      </Card>
      <Card label="Community and support">
        <CardHeader>
          <strong>Community and support</strong>
        </CardHeader>
        <CardBody>
          <dl className="tl-kv">
            <Figure label="New reviews" value={d.community.reviews} hint={d.community.averageRating !== null && d.community.reviews > 0 ? `${d.community.averageRating.toFixed(1)} ★` : undefined} />
            <Figure label="Articles published" value={d.community.articlesPublished} />
            <Figure label="Open job postings" value={d.community.postingsOpen} />
            <Figure label="Job applications" value={d.community.applicationsNew} />
            <Figure label="Support requests" value={d.support.new} hint={`${d.support.open} open now`} />
          </dl>
        </CardBody>
      </Card>
    </div>
  );
}

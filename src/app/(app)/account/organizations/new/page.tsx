/**
 * TL-PAGE-ORGNEW-001 — /account/organizations/new
 *
 * The country list comes from the database, filtered to enabled markets. Only
 * countries actually open for onboarding are offered — listing a market that
 * would be rejected on submit is a form that lies about what it accepts.
 */

import type { Metadata } from 'next';
import Link from 'next/link';
import { db } from '@/platform/db/client';
import { hasDatabase } from '@/platform/config';
import { COUNTRIES } from '@/registry/globalization';
import { NewOrganizationForm } from './new-organization-form';

export const metadata: Metadata = {
  title: 'Create an organization',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

export default async function NewOrganizationPage() {
  // Falls back to the registry seed when no database is configured, so the page
  // still renders on a standalone install rather than crashing.
  const countries = hasDatabase()
    ? (
        await db().country.findMany({
          where: { enabled: true },
          orderBy: { name: 'asc' },
          select: { code: true, name: true, defaultTimezone: true },
        })
      ).map((c) => ({ code: c.code, name: c.name, defaultTimezone: c.defaultTimezone }))
    : COUNTRIES.filter((c) => c.enabled).map((c) => ({
        code: c.code,
        name: c.name,
        defaultTimezone: c.defaultTimezone,
      }));

  return (
    <div className="tl-page" style={{ maxWidth: '40rem' }}>
      <nav aria-label="Breadcrumb" className="tl-breadcrumb">
        <Link href="/account">Account</Link>
        <span aria-hidden="true"> / </span>
        <span aria-current="page">New organization</span>
      </nav>

      <header className="tl-page__header">
        <h1>Create an organization</h1>
        <p className="tl-page__lead">
          A clinic, hospital, college or supplier account. You will be its administrator.
        </p>
      </header>

      <NewOrganizationForm countries={countries} />
    </div>
  );
}

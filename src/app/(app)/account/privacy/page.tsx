/**
 * TL-PAGE-ACCOUNT-PRIVACY-001 — /account/privacy
 *
 * Consent, a copy of your data, and deleting your account — the three things
 * data-protection law guarantees and a trust-first product should make easy
 * rather than bury.
 */

import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { currentPrincipal } from '@/platform/auth/server';
import { isAuthenticated } from '@/platform/rbac';
import { listConsents } from '@/platform/users/preferences';
import { db } from '@/platform/db/client';
import { DELETION_GRACE_DAYS } from '@/platform/auth/service';
import { PrivacyClient } from './privacy-client';

export const metadata: Metadata = { title: 'Privacy and data', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

export default async function PrivacyPage() {
  const principal = await currentPrincipal();
  if (!isAuthenticated(principal)) redirect('/login?next=/account/privacy');

  const [consents, user] = await Promise.all([
    listConsents(principal.userId),
    db().user.findUnique({ where: { id: principal.userId }, select: { locale: true, timezone: true } }),
  ]);
  // Dates are formatted here, in the user's locale and timezone, never in the
  // browser — so the server and client render the same text.
  const formatDate = (d: Date) =>
    new Intl.DateTimeFormat(user?.locale ?? 'en', { dateStyle: 'medium', timeZone: user?.timezone ?? 'Asia/Kolkata' }).format(d);

  return (
    <div className="tl-page">
      <header className="tl-page__header">
        <h1>Privacy and data</h1>
        <p className="tl-page__lead">
          What you allow, a copy of everything we hold about you, and how to leave.
        </p>
      </header>
      <PrivacyClient
        consents={consents.map((c) => ({ ...c, grantedAt: c.grantedAt ? formatDate(c.grantedAt) : null }))}
        graceDays={DELETION_GRACE_DAYS}
      />
    </div>
  );
}

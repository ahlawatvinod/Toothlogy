/**
 * TL-PAGE-ACCOUNT-001 — /account
 *
 * The signed-in home. A server component: it reads the user directly from the
 * database rather than fetching its own API, which removes a network round trip
 * and the loading state that would come with it.
 *
 * The page states plainly what is and is not verified, and what is not yet
 * built. A dashboard that shows an "Appointments" tile leading nowhere is worse
 * than one that says appointments are not available yet.
 */

import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { db } from '@/platform/db/client';
import { currentPrincipal, currentUserCan } from '@/platform/auth/server';
import { isAuthenticated } from '@/platform/rbac';
import { listUserOrganizations } from '@/platform/organizations/service';
import { listInAppNotifications } from '@/platform/notifications/delivery';
import { Alert, Badge, Card, CardBody, CardHeader, EmptyState } from '@/design-system';

export const metadata: Metadata = {
  title: 'Your account',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

export default async function AccountPage() {
  const principal = await currentPrincipal();
  if (!isAuthenticated(principal)) redirect('/login');

  const [
    user,
    organizations,
    notifications,
    canManageDentistProfile,
    canReviewVerifications,
    dentistProfile,
  ] = await Promise.all([
    db().user.findUnique({
      where: { id: principal.userId },
      include: { profiles: { where: { deletedAt: null } } },
    }),
    listUserOrganizations(principal.userId),
    listInAppNotifications(principal.userId, { limit: 5 }),
    currentUserCan('tl.dentist.profile.manage.self'),
    currentUserCan('tl.verification.request.review'),
    db().dentistProfile.findUnique({
      where: { userId: principal.userId },
      select: { isDiscoverable: true, isVerified: true, status: true },
    }),
  ]);

  if (!user) redirect('/login');

  return (
    <div className="tl-container tl-page">
      <header className="tl-page__header">
        <h1>Welcome, {user.displayName ?? 'there'}</h1>
        <p className="tl-page__lead">
          {user.email ?? user.phone} ·{' '}
          {principal.roles.filter((r) => r !== 'user').join(', ') || 'patient'}
        </p>
      </header>

      {/*
       * An unverified contact is surfaced, not hidden: verification gates
       * appointment reminders, and a user who does not know they are unverified
       * cannot fix it.
       */}
      {user.email && !user.emailVerifiedAt ? (
        <Alert tone="warning" title="Your email address is not verified">
          Verify your email so appointment confirmations and reminders can reach you.
        </Alert>
      ) : null}

      <div className="tl-card-grid">
        <Card label="Notifications">
          <CardHeader>
            <div className="tl-card__title-row">
              <strong>Notifications</strong>
              {notifications.unreadCount > 0 ? (
                <Badge tone="brand">{notifications.unreadCount} unread</Badge>
              ) : null}
            </div>
          </CardHeader>
          <CardBody>
            {notifications.items.length === 0 ? (
              <EmptyState
                title="Nothing yet"
                description="Confirmations, reminders and messages will appear here."
              />
            ) : (
              <ul className="tl-list">
                {notifications.items.map((n) => (
                  <li key={n.id} className={n.readAt ? '' : 'tl-list__item--unread'}>
                    <strong>{n.title}</strong>
                    <span className="tl-list__meta">{n.body}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>

        <Card label="Your organizations">
          <CardHeader>
            <div className="tl-card__title-row">
              <strong>Organizations</strong>
              <Link className="tl-button tl-button--ghost tl-button--sm" href="/account/organizations/new">
                Add
              </Link>
            </div>
          </CardHeader>
          <CardBody>
            {organizations.length === 0 ? (
              <EmptyState
                title="No organizations yet"
                description="Create one to manage a clinic, college or supplier account."
                action={
                  <Link
                    className="tl-button tl-button--secondary tl-button--md"
                    href="/account/organizations/new"
                  >
                    Create an organization
                  </Link>
                }
              />
            ) : (
              <ul className="tl-list">
                {organizations.map((org) => (
                  <li key={org.id}>
                    <Link href={`/account/organizations/${org.id}`}>
                      <strong>{org.name}</strong>
                    </Link>
                    <span className="tl-list__meta">
                      {org.roleKey.replace(/_/g, ' ')} ·{' '}
                      {org.verifiedAt ? (
                        <Badge tone="success">Verified</Badge>
                      ) : (
                        <Badge tone="warning">Pending verification</Badge>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>

        {/*
         * Shown only to dentists. Gated on the permission rather than on a role
         * string, so it cannot drift from the check the page itself performs.
         */}
        {canManageDentistProfile ? (
          <Card label="Your dentist profile">
            <CardHeader>
              <div className="tl-card__title-row">
                <strong>Dentist profile</strong>
                {dentistProfile?.isDiscoverable ? (
                  <Badge tone="success">In search</Badge>
                ) : (
                  <Badge tone="warning">Not in search</Badge>
                )}
              </div>
            </CardHeader>
            <CardBody>
              <p className="tl-muted">
                {dentistProfile?.isDiscoverable
                  ? 'Patients can find you.'
                  : dentistProfile
                    ? 'Your profile is not yet appearing in patient search. Open it to see exactly what is missing.'
                    : 'Create your professional profile so patients can find you.'}
              </p>
              <Link
                className="tl-button tl-button--secondary tl-button--md"
                href="/account/dentist-profile"
              >
                {dentistProfile ? 'Manage your profile' : 'Create your profile'}
              </Link>
            </CardBody>
          </Card>
        ) : null}

        {canReviewVerifications ? (
          <Card label="Verification queue">
            <CardHeader>
              <strong>Verification queue</strong>
            </CardHeader>
            <CardBody>
              <p className="tl-muted">
                Review dentist credentials against the issuing council&rsquo;s register.
              </p>
              <Link
                className="tl-button tl-button--secondary tl-button--md"
                href="/admin/verification"
              >
                Open the queue
              </Link>
            </CardBody>
          </Card>
        ) : null}

        <Card label="Security">
          <CardHeader>
            <strong>Security</strong>
          </CardHeader>
          <CardBody>
            <p className="tl-muted">
              Review the devices signed in to your account and change your password.
            </p>
            <Link className="tl-button tl-button--secondary tl-button--md" href="/account/security">
              Security settings
            </Link>
          </CardBody>
        </Card>
      </div>

      {/*
       * Stated honestly rather than shown as dead tiles. Constitution P9: a
       * dashboard that implies working features is the most damaging kind of
       * false progress, because users plan around it.
       */}
      <Card label="Coming soon">
        <CardHeader>
          <strong>Not available yet</strong>
        </CardHeader>
        <CardBody>
          <p className="tl-muted">
            Appointments, dental records, messaging and the marketplace are not built yet. They
            arrive in later phases and will appear here when they genuinely work.
          </p>
        </CardBody>
      </Card>
    </div>
  );
}

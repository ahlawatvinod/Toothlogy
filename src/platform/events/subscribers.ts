/**
 * TOOTHLOGY PLATFORM SUBSCRIBERS
 *
 * The durable reactions to domain events, registered in one place so that
 * "what happens when X?" has a single answer to read.
 *
 * Handler keys are permanent — they are receipt identities (see ./outbox.ts).
 * Each handler must be safe to run again after a partial failure elsewhere in
 * the same event; notifications are, because a handler that has a receipt is
 * never re-run for that event.
 *
 * Divisions built in later phases register their own subscribers from their
 * own module (`registerAppointmentSubscribers`, …) and are wired in here, so
 * this file stays the index rather than accumulating their logic.
 */

import { db } from '../db/client';
import { SECURITY_EVENT_COPY, type SecurityEventType } from '../auth/security-events';
import { notifyOrganizationAdmins, notifyUser } from '../notifications';
import { formatDateTime } from '../i18n';
import { registerDurableHandler, clearDurableHandlers } from './outbox';
import { registerAppointmentSubscribers } from '../appointments/subscribers';

type Registrar = () => void;

/** Later phases add their registrars here. */
const DIVISION_REGISTRARS: Registrar[] = [];

export function addSubscriberRegistrar(registrar: Registrar): void {
  if (!DIVISION_REGISTRARS.includes(registrar)) DIVISION_REGISTRARS.push(registrar);
}

let registered = false;

export function registerPlatformSubscribers(): void {
  if (registered) return;
  registered = true;

  // --- Identity -------------------------------------------------------------

  registerDurableHandler('USER_CREATED', 'notify.welcome', async (event) => {
    const { userId } = event.payload as { userId: string };
    const user = await db().user.findUnique({ where: { id: userId }, select: { displayName: true } });
    await notifyUser({
      userId,
      notificationId: 'TL-NOTIF-WELCOME-001',
      data: { name: user?.displayName ?? 'there' },
      linkUrl: '/account',
      sourceEventId: event.id,
    });
  });

  registerDurableHandler('SECURITY_ALERT_RAISED', 'notify.security-alert', async (event) => {
    const { userId, securityEventId, type } = event.payload as {
      userId: string;
      securityEventId: string;
      type: SecurityEventType;
    };
    const record = await db().securityEvent.findUnique({ where: { id: securityEventId } });
    const user = await db().user.findUnique({ where: { id: userId }, select: { locale: true, timezone: true } });
    await notifyUser({
      userId,
      notificationId: 'TL-NOTIF-SECURITY-ALERT-001',
      data: {
        alert: SECURITY_EVENT_COPY[type] ?? 'Security activity on your account',
        // Rendered in the account holder's own timezone: "02:14" means nothing
        // to a user if it is the server's clock.
        when: record
          ? formatDateTime(record.occurredAt, user?.locale ?? 'en', user?.timezone ?? 'UTC')
          : '',
        ipAddress: record?.ipAddress ?? 'unknown',
      },
      linkUrl: '/account/security',
      sourceEventId: event.id,
    });
  });

  registerDurableHandler('ORGANIZATION_MEMBER_JOINED', 'notify.org-admins.member-joined', async (event) => {
    const { organizationId, userId, roleKey } = event.payload as {
      organizationId: string;
      userId: string;
      roleKey: string;
    };
    const [member, organization] = await Promise.all([
      db().user.findUnique({ where: { id: userId }, select: { displayName: true } }),
      db().organization.findUnique({ where: { id: organizationId }, select: { name: true } }),
    ]);
    await notifyOrganizationAdmins({
      organizationId,
      notificationId: 'TL-NOTIF-ORG-MEMBER-JOINED-001',
      data: {
        member: member?.displayName ?? 'A new member',
        organization: organization?.name ?? 'your organization',
        role: roleKey.replace(/_/g, ' '),
      },
      linkUrl: `/account/organizations/${organizationId}`,
      sourceEventId: event.id,
    });
  });

  // --- Trust ------------------------------------------------------------------

  registerDurableHandler('DENTIST_VERIFIED', 'notify.verification-result.dentist', async (event) => {
    const { userId, decision, reason } = event.payload as {
      userId: string;
      decision: 'APPROVED' | 'REJECTED' | 'REVOKED';
      reason?: string | null;
    };
    await notifyUser({
      userId,
      notificationId: 'TL-NOTIF-VERIFICATION-RESULT-001',
      data: { subject: 'your dentist profile', outcome: outcomeCopy(decision), reason: reason ?? '' },
      linkUrl: '/account/dentist-profile',
      sourceEventId: event.id,
    });
  });

  registerDurableHandler('CLINIC_VERIFIED', 'notify.verification-result.organization', async (event) => {
    const { organizationId, decision, reason } = event.payload as {
      organizationId: string;
      decision: 'APPROVED' | 'REJECTED' | 'REVOKED';
      reason?: string | null;
    };
    const organization = await db().organization.findUnique({
      where: { id: organizationId },
      select: { name: true },
    });
    await notifyOrganizationAdmins({
      organizationId,
      notificationId: 'TL-NOTIF-VERIFICATION-RESULT-001',
      data: { subject: organization?.name ?? 'your organization', outcome: outcomeCopy(decision), reason: reason ?? '' },
      linkUrl: `/account/organizations/${organizationId}`,
      sourceEventId: event.id,
    });
  });

  registerDurableHandler('PRACTICE_CLAIMED', 'notify.org-admins.practice-claimed', async (event) => {
    const { organizationId, dentistName, locationName } = event.payload as {
      organizationId: string;
      dentistName: string;
      locationName: string;
    };
    await notifyOrganizationAdmins({
      organizationId,
      notificationId: 'TL-NOTIF-PRACTICE-CLAIM-001',
      data: { dentist: dentistName, location: locationName },
      linkUrl: `/account/organizations/${organizationId}`,
      sourceEventId: event.id,
    });
  });

  registerDurableHandler('PRACTICE_CONFIRMED', 'notify.dentist.practice-confirmed', async (event) => {
    const { dentistUserId, locationName, organizationName } = event.payload as {
      dentistUserId: string;
      locationName: string;
      organizationName: string;
    };
    await notifyUser({
      userId: dentistUserId,
      notificationId: 'TL-NOTIF-PRACTICE-CONFIRMED-001',
      data: { location: locationName, organization: organizationName },
      linkUrl: '/account/dentist-profile',
      sourceEventId: event.id,
    });
  });

  // --- Discovery ----------------------------------------------------------------

  // A clinic's Verified flag is shown in search results. The reindex is
  // idempotent, so a replay after a partial failure is harmless.
  registerDurableHandler('CLINIC_VERIFIED', 'search.reindex.organization', async (event) => {
    const { organizationId } = event.payload as { organizationId: string };
    const { reindexOrganization } = await import('../discovery/indexer');
    await reindexOrganization(organizationId);
  });

  // --- Appointments, waitlist, leads and billing (Phase 4) -----------------------
  registerAppointmentSubscribers();

  for (const registrar of DIVISION_REGISTRARS) registrar();
}

function outcomeCopy(decision: 'APPROVED' | 'REJECTED' | 'REVOKED'): string {
  switch (decision) {
    case 'APPROVED':
      return 'was approved';
    case 'REJECTED':
      return 'was not approved';
    case 'REVOKED':
      return 'was withdrawn';
  }
}

/** Test-only: forget registrations so a suite can register afresh. */
export function resetPlatformSubscribers(): void {
  registered = false;
  clearDurableHandlers();
}

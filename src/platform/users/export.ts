/**
 * TOOTHLOGY PERSONAL DATA EXPORT
 *
 * Everything Toothlogy holds about a person, in one machine-readable file —
 * the right of access and portability that data-protection law gives every
 * user, and a precondition for Constitution P4 ("patients own their health
 * data") meaning anything.
 *
 * Sections are registered by the division that owns the data, so a division
 * added in a later phase adds its own section rather than this file having to
 * know about appointments or records. Secrets are never exported: no password
 * or token hashes, no TOTP secret, no session tokens.
 */

import { db } from '../db/client';

export type ExportSection = (userId: string) => Promise<unknown>;

const sections = new Map<string, ExportSection>();

export function registerExportSection(name: string, section: ExportSection): void {
  sections.set(name, section);
}

registerExportSection('account', async (userId) => {
  const user = await db().user.findUnique({ where: { id: userId } });
  if (!user) return null;
  return {
    id: user.id,
    email: user.email,
    phone: user.phone,
    displayName: user.displayName,
    emailVerifiedAt: user.emailVerifiedAt,
    phoneVerifiedAt: user.phoneVerifiedAt,
    status: user.status,
    locale: user.locale,
    countryCode: user.countryCode,
    timezone: user.timezone,
    createdAt: user.createdAt,
  };
});

registerExportSection('preferences', (userId) => db().userPreference.findUnique({ where: { userId } }));

registerExportSection('notificationPreferences', (userId) =>
  db().notificationPreference.findMany({
    where: { userId },
    select: { channel: true, category: true, enabled: true, updatedAt: true },
  }),
);

// The full history, including revoked grants: when consent was given and
// withdrawn is itself the user's data.
registerExportSection('consents', (userId) =>
  db().consent.findMany({
    where: { userId },
    select: { purpose: true, grantedAt: true, revokedAt: true, policyVersion: true },
    orderBy: { grantedAt: 'asc' },
  }),
);

registerExportSection('savedLocations', (userId) =>
  db().savedLocation.findMany({ where: { userId }, select: { label: true, latitude: true, longitude: true, isDefault: true } }),
);

registerExportSection('profiles', (userId) =>
  db().profile.findMany({
    where: { userId },
    select: { type: true, displayName: true, headline: true, bio: true, slug: true, isPublic: true, createdAt: true },
  }),
);

registerExportSection('organizations', (userId) =>
  db().organizationMember.findMany({
    where: { userId },
    select: {
      roleKey: true,
      title: true,
      joinedAt: true,
      leftAt: true,
      organization: { select: { id: true, name: true, type: true } },
    },
  }),
);

registerExportSection('dentistProfile', (userId) =>
  db().dentistProfile.findUnique({
    where: { userId },
    include: { qualifications: true, specialties: { include: { specialty: { select: { key: true, name: true } } } } },
  }),
);

registerExportSection('sessions', (userId) =>
  db().session.findMany({
    where: { userId },
    // tokenHash deliberately omitted.
    select: { ipAddress: true, userAgent: true, createdAt: true, lastActiveAt: true, expiresAt: true, revokedAt: true },
  }),
);

registerExportSection('securityEvents', (userId) =>
  db().securityEvent.findMany({
    where: { userId },
    select: { type: true, ipAddress: true, userAgent: true, occurredAt: true },
    orderBy: { occurredAt: 'desc' },
    take: 500,
  }),
);

registerExportSection('files', (userId) =>
  db().fileObject.findMany({
    where: { ownerUserId: userId },
    select: {
      id: true,
      purpose: true,
      contentType: true,
      sizeBytes: true,
      originalFilename: true,
      status: true,
      createdAt: true,
      deletedAt: true,
    },
  }),
);

// Phase 6: the dental record, who may see it, and prescriptions — the data
// Constitution P4 says the patient owns.
registerExportSection('dentalRecord', (userId) =>
  db().recordEntry.findMany({
    where: { patientUserId: userId, deletedAt: null },
    select: {
      kind: true,
      title: true,
      notes: true,
      teeth: true,
      occurredOn: true,
      fileId: true,
      retractedAt: true,
      retractedReason: true,
      createdAt: true,
      organization: { select: { name: true } },
      dependent: { select: { name: true } },
    },
    orderBy: { occurredOn: 'asc' },
  }),
);

registerExportSection('recordAccessGrants', (userId) =>
  db().recordAccessGrant.findMany({
    where: { patientUserId: userId },
    select: { status: true, canWrite: true, grantedAt: true, expiresAt: true, endedAt: true, endedReason: true, createdAt: true, organization: { select: { name: true } } },
    orderBy: { createdAt: 'asc' },
  }),
);

registerExportSection('treatmentPlans', async (userId) =>
  (
    await db().treatmentPlan.findMany({
      where: { patientUserId: userId },
      select: {
        title: true,
        notes: true,
        status: true,
        currency: true,
        estimateMinor: true,
        decidedAt: true,
        declineReason: true,
        completedAt: true,
        cancelledAt: true,
        cancelledReason: true,
        createdAt: true,
        organization: { select: { name: true } },
        dependent: { select: { name: true } },
        items: { select: { position: true, description: true, treatmentKey: true, teeth: true, estimateMinor: true, status: true, doneAt: true, skipReason: true }, orderBy: { position: 'asc' } },
      },
      orderBy: { createdAt: 'asc' },
    })
  ).map((plan) => ({
    ...plan,
    // Amounts as strings: JSON has no 64-bit integers.
    estimateMinor: plan.estimateMinor.toString(),
    items: plan.items.map((item) => ({ ...item, estimateMinor: item.estimateMinor.toString() })),
  })),
);

registerExportSection('prescriptions', (userId) =>
  db().prescription.findMany({
    where: { patientUserId: userId },
    select: { items: true, advice: true, status: true, issuedAt: true, cancelledAt: true, cancelledReason: true, organization: { select: { name: true } }, prescriber: { select: { displayName: true } }, dependent: { select: { name: true } } },
    orderBy: { issuedAt: 'asc' },
  }),
);

registerExportSection('notifications', (userId) =>
  db().inAppNotification.findMany({
    where: { userId },
    select: { title: true, body: true, createdAt: true, readAt: true },
    orderBy: { createdAt: 'desc' },
    take: 1000,
  }),
);

registerExportSection('activity', (userId) =>
  db().auditEvent.findMany({
    where: { OR: [{ actor: userId }, { subject: userId }] },
    select: { action: true, outcome: true, occurredAt: true, ipAddress: true },
    orderBy: { occurredAt: 'desc' },
    take: 1000,
  }),
);

export async function exportUserData(userId: string): Promise<Record<string, unknown>> {
  const out: Record<string, unknown> = {};
  for (const [name, section] of sections) out[name] = await section(userId);
  return {
    format: 'toothlogy-personal-data-export',
    version: 1,
    exportedAt: new Date().toISOString(),
    sections: out,
  };
}

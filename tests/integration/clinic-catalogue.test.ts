/**
 * TL-TEST-CLINIC-CATALOGUE-001 — Clinic services, branches, practice settings and claims
 *
 * What a patient is shown about a clinic — which treatments, at what price, on
 * which days, with which dentist — is only as honest as the rules behind it.
 * These tests hold the rules that fail silently when broken: a second price
 * for the same treatment, a video "filling", a slot on a declared holiday, a
 * dentist listed at a clinic that never confirmed them, a clinic listing taken
 * over without evidence.
 */

import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';
import { register } from '@/platform/auth/service';
import { createOrganization } from '@/platform/organizations/service';
import { createLocation } from '@/platform/organizations/locations';
import {
  addQualification,
  claimPractice,
  confirmPractice,
  submitForVerification,
  upsertDentistProfile,
} from '@/platform/dentists/service';
import { listPendingVerificationsForReview, reviewVerification } from '@/platform/verification/service';
import { canReadFile } from '@/platform/storage/files';
import { createOffering, listPublicOfferings, updateOffering } from '@/platform/organizations/offerings';
import {
  addClosure,
  closeLocation,
  listClosures,
  localDate,
  removeClosure,
  updateLocation,
} from '@/platform/organizations/location-management';
import { updatePracticeSettings } from '@/platform/dentists/practice';
import { claimOrganization, createListingOrganization } from '@/platform/organizations/claim';
import { getPublicClinic } from '@/platform/organizations/public';
import type { AuthenticatedPrincipal } from '@/platform/rbac';
import {
  assertSeeded,
  describeIntegration,
  disconnectTestDb,
  resetDatabase,
  testDb,
  useDatabaseAuditSink,
} from '../helpers/database';

const PASSWORD = 'a sufficiently long passphrase';

async function user(email: string, role: 'dentist' | 'patient' = 'patient') {
  return (await register({ email, password: PASSWORD, displayName: email.split('@')[0]!, role, acceptedTerms: true }))
    .userId;
}

async function makeReviewer(email: string) {
  const userId = await user(email);
  await testDb().roleAssignment.create({
    data: { id: `ra_${Date.now()}_${Math.random().toString(36).slice(2)}`, userId, roleKey: 'moderator' },
  });
  return userId;
}

async function makeClinic(slug: string, ownerEmail: string) {
  const ownerId = await user(ownerEmail, 'dentist');
  const { organizationId } = await createOrganization(
    { name: `Clinic ${slug}`, slug, type: 'CLINIC', countryCode: 'IN', timezone: 'Asia/Kolkata' },
    ownerId,
  );
  const { locationId } = await createLocation(
    organizationId,
    { name: 'Main', slug: 'main', timezone: 'Asia/Kolkata', isPrimary: true, latitude: 21.2514, longitude: 81.6296 },
    ownerId,
  );
  return { ownerId, organizationId, locationId };
}

async function makeVerifiedDentist(email: string, slug: string, reviewerId: string) {
  const userId = await user(email, 'dentist');
  await upsertDentistProfile(userId, {
    slug,
    bio: 'A practising dentist with more than ten years of clinical experience in general and restorative dentistry.',
    languages: ['en'],
    specialtyKeys: ['general_dentistry'],
  });
  await addQualification(userId, {
    degree: 'BDS',
    institution: 'Government Dental College',
    year: 2012,
    registrationNumber: `DCI-${slug}`,
    registrationBody: 'Dental Council of India',
  });
  const { verificationRequestId } = await submitForVerification(userId);
  await reviewVerification({ verificationRequestId, decision: 'APPROVED' }, reviewerId);
  const profile = await testDb().dentistProfile.findUniqueOrThrow({ where: { userId } });
  return { userId, dentistProfileId: profile.id };
}

function principal(
  userId: string,
  organizations: AuthenticatedPrincipal['organizations'] = [],
  roles: string[] = ['dentist'],
): AuthenticatedPrincipal {
  return { kind: 'user', userId, roles, organizations, sessionId: 'test-session' };
}

async function evidenceFile(ownerUserId: string) {
  const id = `file_${Math.random().toString(36).slice(2)}`;
  await testDb().fileObject.create({
    data: {
      id,
      storageKey: `test/${id}`,
      contentType: 'application/pdf',
      sizeBytes: 2048,
      checksum: 'sha256-test',
      sensitivity: 'CONFIDENTIAL',
      ownerUserId,
      purpose: 'CERTIFICATE',
    },
  });
  return id;
}

/** A date `days` from today on the Kolkata calendar, as YYYY-MM-DD. */
function daysFromNow(days: number): string {
  return localDate('Asia/Kolkata', new Date(Date.now() + days * 86_400_000));
}

describeIntegration('clinic services, branches, practice settings and claims (integration)', () => {
  beforeAll(async () => {
    await assertSeeded();
    // The catalogue is reference data; without it every offering test fails
    // confusingly on "choose a treatment from the catalogue".
    const treatments = await testDb().treatment.count();
    if (treatments === 0) throw new Error('Treatment catalogue not seeded. Run: npm run db:seed');
  });

  beforeEach(async () => {
    await resetDatabase();
    useDatabaseAuditSink();
  });

  afterAll(async () => {
    await disconnectTestDb();
  });

  // -------------------------------------------------------------------------
  // Service offerings
  // -------------------------------------------------------------------------

  it('creates an offering from the catalogue, priced in the organization currency', async () => {
    const { ownerId, organizationId, locationId } = await makeClinic('bright', 'owner@example.test');

    const { offeringId } = await createOffering(
      organizationId,
      { locationId, treatmentKey: 'dental_consultation', priceMinor: 50_000 },
      ownerId,
    );

    const row = await testDb().serviceOffering.findUniqueOrThrow({ where: { id: offeringId }, include: { treatment: true } });
    expect(row.currency).toBe('INR');
    expect(row.name).toBe(row.treatment!.name);
    expect(row.durationMinutes).toBe(row.treatment!.typicalDurationMinutes);
    expect(row.appointmentTypes).toEqual(['CLINIC']);

    const audit = await testDb().auditEvent.count({ where: { action: 'SERVICE_OFFERING_CREATED', subject: offeringId } });
    expect(audit).toBe(1);
  });

  it('records "price on consultation" as no price and no currency, not as zero', async () => {
    const { ownerId, organizationId, locationId } = await makeClinic('bright', 'owner@example.test');
    const { offeringId } = await createOffering(
      organizationId,
      { locationId, treatmentKey: 'composite_filling', priceMinor: null },
      ownerId,
    );
    const row = await testDb().serviceOffering.findUniqueOrThrow({ where: { id: offeringId } });
    expect(row.priceMinor).toBeNull();
    expect(row.currency).toBeNull();
  });

  it('refuses a second active price for the same treatment at the same location', async () => {
    const { ownerId, organizationId, locationId } = await makeClinic('bright', 'owner@example.test');
    const input = { locationId, treatmentKey: 'scaling_polishing', priceMinor: 80_000 };
    await createOffering(organizationId, input, ownerId);
    await expect(createOffering(organizationId, input, ownerId)).rejects.toThrow(/already offered/i);
  });

  it('allows re-offering a treatment once the old offering is deactivated', async () => {
    const { ownerId, organizationId, locationId } = await makeClinic('bright', 'owner@example.test');
    const input = { locationId, treatmentKey: 'scaling_polishing', priceMinor: 80_000 };
    const { offeringId } = await createOffering(organizationId, input, ownerId);
    await updateOffering(organizationId, offeringId, { isActive: false }, ownerId);

    await expect(createOffering(organizationId, { ...input, priceMinor: 90_000 }, ownerId)).resolves.toBeDefined();
    // The old row still exists: past bookings reference the price they were made at.
    expect(await testDb().serviceOffering.count({ where: { locationId } })).toBe(2);
  });

  it('rejects a price range whose upper bound is below its start', async () => {
    const { ownerId, organizationId, locationId } = await makeClinic('bright', 'owner@example.test');
    await expect(
      createOffering(organizationId, { locationId, treatmentKey: 'composite_filling', priceMinor: 200_000, priceMaxMinor: 100_000 }, ownerId),
    ).rejects.toThrow(/not valid/i);

    const { offeringId } = await createOffering(
      organizationId,
      { locationId, treatmentKey: 'composite_filling', priceMinor: 100_000, priceMaxMinor: 200_000 },
      ownerId,
    );
    // The same rule on update, where only one bound changes.
    await expect(updateOffering(organizationId, offeringId, { priceMinor: 300_000 }, ownerId)).rejects.toThrow(/upper price/i);
  });

  it('offers video only for treatments that can happen over video', async () => {
    const { ownerId, organizationId, locationId } = await makeClinic('bright', 'owner@example.test');
    await expect(
      createOffering(organizationId, { locationId, treatmentKey: 'composite_filling', priceMinor: 1, appointmentTypes: ['VIDEO'] }, ownerId),
    ).rejects.toThrow(/cannot be done by video/i);

    await expect(
      createOffering(organizationId, { locationId, treatmentKey: 'dental_consultation', priceMinor: 1, appointmentTypes: ['CLINIC', 'VIDEO'] }, ownerId),
    ).resolves.toBeDefined();
  });

  it('offers home visits only where the location has declared a home-visit area', async () => {
    const { ownerId, organizationId, locationId } = await makeClinic('bright', 'owner@example.test');
    const input = { locationId, treatmentKey: 'dental_consultation', priceMinor: 1, appointmentTypes: ['HOME_VISIT' as const] };
    await expect(createOffering(organizationId, input, ownerId)).rejects.toThrow(/home-visit area/i);

    await updateLocation(organizationId, locationId, { homeVisitRadiusKm: 8 }, ownerId);
    await expect(createOffering(organizationId, input, ownerId)).resolves.toBeDefined();
  });

  it('only accepts treatments that are in the catalogue', async () => {
    const { ownerId, organizationId, locationId } = await makeClinic('bright', 'owner@example.test');
    await expect(
      createOffering(organizationId, { locationId, treatmentKey: 'teeth_whitening_by_laser_magic', priceMinor: 1 }, ownerId),
    ).rejects.toThrow(/catalogue/i);
  });

  it('cannot place or edit an offering at another organization’s location', async () => {
    const a = await makeClinic('clinic-a', 'a@example.test');
    const b = await makeClinic('clinic-b', 'b@example.test');

    await expect(
      createOffering(a.organizationId, { locationId: b.locationId, treatmentKey: 'dental_consultation', priceMinor: 1 }, a.ownerId),
    ).rejects.toThrow(/not found/i);

    const { offeringId } = await createOffering(
      b.organizationId,
      { locationId: b.locationId, treatmentKey: 'dental_consultation', priceMinor: 1 },
      b.ownerId,
    );
    await expect(updateOffering(a.organizationId, offeringId, { priceMinor: 999 }, a.ownerId)).rejects.toThrow(/not found/i);
  });

  it('gives a dentist their own price only once the clinic has confirmed their practice', async () => {
    const reviewerId = await makeReviewer('rev@example.test');
    const clinic = await makeClinic('bright', 'owner@example.test');
    const dentist = await makeVerifiedDentist('dentist@example.test', 'dr-one', reviewerId);
    const claim = await claimPractice(dentist.userId, clinic.locationId);

    const input = { locationId: clinic.locationId, treatmentKey: 'dental_consultation', priceMinor: 70_000 };
    await expect(
      createOffering(clinic.organizationId, input, dentist.userId, { dentistProfileId: dentist.dentistProfileId }),
    ).rejects.toThrow(/confirmed by the clinic/i);

    await confirmPractice(claim.practiceId, clinic.organizationId, clinic.ownerId);

    // The clinic's own price for the same treatment coexists with the dentist's.
    await createOffering(clinic.organizationId, { ...input, priceMinor: 50_000 }, clinic.ownerId);
    await createOffering(clinic.organizationId, input, dentist.userId, { dentistProfileId: dentist.dentistProfileId });

    const offerings = await listPublicOfferings(clinic.locationId);
    expect(offerings.map((o) => o.priceMinor).sort()).toEqual([50_000, 70_000]);
  });

  // -------------------------------------------------------------------------
  // Branches and closures
  // -------------------------------------------------------------------------

  it('validates location edits: paired coordinates and facilities from the list', async () => {
    const { ownerId, organizationId, locationId } = await makeClinic('bright', 'owner@example.test');
    await expect(updateLocation(organizationId, locationId, { latitude: 21.2 }, ownerId)).rejects.toThrow(/not valid/i);
    await expect(
      updateLocation(organizationId, locationId, { facilities: ['helipad'] }, ownerId),
    ).rejects.toThrow(/not valid/i);

    const updated = await updateLocation(organizationId, locationId, { chairs: 4, wheelchairAccessible: true }, ownerId);
    expect(updated.chairs).toBe(4);
    expect(updated.wheelchairAccessible).toBe(true);
  });

  it('refuses to attach photos that are not this organization’s clinic photos', async () => {
    const { ownerId, organizationId, locationId } = await makeClinic('bright', 'owner@example.test');
    const someoneElsesFile = await evidenceFile(ownerId); // a CERTIFICATE, owned by a user, not the org
    await expect(
      updateLocation(organizationId, locationId, { photoFileIds: [someoneElsesFile] }, ownerId),
    ).rejects.toThrow(/clinic photos/i);
  });

  it('removes a dentist from search when their only branch is closed', async () => {
    const reviewerId = await makeReviewer('rev@example.test');
    const clinic = await makeClinic('bright', 'owner@example.test');
    const dentist = await makeVerifiedDentist('dentist@example.test', 'dr-one', reviewerId);
    const claim = await claimPractice(dentist.userId, clinic.locationId);
    await confirmPractice(claim.practiceId, clinic.organizationId, clinic.ownerId);

    let profile = await testDb().dentistProfile.findUniqueOrThrow({ where: { userId: dentist.userId } });
    expect(profile.isDiscoverable).toBe(true);

    await updateLocation(clinic.organizationId, clinic.locationId, { status: 'TEMPORARILY_CLOSED' }, clinic.ownerId);
    profile = await testDb().dentistProfile.findUniqueOrThrow({ where: { userId: dentist.userId } });
    expect(profile.isDiscoverable).toBe(false);

    await updateLocation(clinic.organizationId, clinic.locationId, { status: 'ACTIVE' }, clinic.ownerId);
    profile = await testDb().dentistProfile.findUniqueOrThrow({ where: { userId: dentist.userId } });
    expect(profile.isDiscoverable).toBe(true);

    await closeLocation(clinic.organizationId, clinic.locationId, clinic.ownerId);
    profile = await testDb().dentistProfile.findUniqueOrThrow({ where: { userId: dentist.userId } });
    expect(profile.isDiscoverable).toBe(false);
  });

  it('records closures on the clinic calendar and refuses ones entirely in the past', async () => {
    const { ownerId, organizationId, locationId } = await makeClinic('bright', 'owner@example.test');

    await expect(
      addClosure(organizationId, locationId, { startsOn: '2020-01-01', endsOn: '2020-01-02' }, ownerId),
    ).rejects.toThrow(/past/i);
    await expect(
      addClosure(organizationId, locationId, { startsOn: daysFromNow(5), endsOn: daysFromNow(2) }, ownerId),
    ).rejects.toThrow(/not valid/i);
    await expect(
      addClosure(organizationId, locationId, { startsOn: daysFromNow(1), endsOn: daysFromNow(200) }, ownerId),
    ).rejects.toThrow(/180 days/i);

    const { closureId } = await addClosure(
      organizationId,
      locationId,
      { startsOn: daysFromNow(3), endsOn: daysFromNow(4), reason: 'Diwali' },
      ownerId,
    );
    const closures = await listClosures(locationId, localDate('Asia/Kolkata'));
    expect(closures).toEqual([{ id: closureId, startsOn: daysFromNow(3), endsOn: daysFromNow(4), reason: 'Diwali' }]);
  });

  it('cannot remove another organization’s closure', async () => {
    const a = await makeClinic('clinic-a', 'a@example.test');
    const b = await makeClinic('clinic-b', 'b@example.test');
    const { closureId } = await addClosure(
      b.organizationId,
      b.locationId,
      { startsOn: daysFromNow(3), endsOn: daysFromNow(3) },
      b.ownerId,
    );
    await expect(removeClosure(a.organizationId, closureId, a.ownerId)).rejects.toThrow(/not found/i);
    expect(await testDb().locationClosure.count()).toBe(1);
  });

  // -------------------------------------------------------------------------
  // Practice booking settings
  // -------------------------------------------------------------------------

  it('lets the dentist or their clinic change practice settings, and no one else', async () => {
    const reviewerId = await makeReviewer('rev@example.test');
    const clinic = await makeClinic('bright', 'owner@example.test');
    const other = await makeClinic('other', 'other@example.test');
    const dentist = await makeVerifiedDentist('dentist@example.test', 'dr-one', reviewerId);
    const { practiceId } = await claimPractice(dentist.userId, clinic.locationId);

    const updated = await updatePracticeSettings(principal(dentist.userId), practiceId, { slotMinutes: 20, autoConfirm: true });
    expect(updated.slotMinutes).toBe(20);
    expect(updated.autoConfirm).toBe(true);

    const clinicAdmin = principal(clinic.ownerId, [{ organizationId: clinic.organizationId, roles: ['clinic_admin'] }]);
    await expect(updatePracticeSettings(clinicAdmin, practiceId, { bookingPaused: true })).resolves.toMatchObject({
      bookingPaused: true,
    });

    // Another clinic's administrator does not learn the practice exists.
    const stranger = principal(other.ownerId, [{ organizationId: other.organizationId, roles: ['clinic_admin'] }]);
    await expect(updatePracticeSettings(stranger, practiceId, { bookingPaused: false })).rejects.toThrow(/not found/i);

    const audits = await testDb().auditEvent.findMany({ where: { action: 'PRACTICE_SETTINGS_UPDATED', subject: practiceId } });
    expect(audits).toHaveLength(2);
  });

  it('validates practice settings', async () => {
    const reviewerId = await makeReviewer('rev@example.test');
    const clinic = await makeClinic('bright', 'owner@example.test');
    const dentist = await makeVerifiedDentist('dentist@example.test', 'dr-one', reviewerId);
    const { practiceId } = await claimPractice(dentist.userId, clinic.locationId);
    const me = principal(dentist.userId);

    await expect(updatePracticeSettings(me, practiceId, { slotMinutes: 17 })).rejects.toThrow(/not valid/i);
    await expect(updatePracticeSettings(me, practiceId, { acceptsHomeVisit: true })).rejects.toThrow(/home-visit area/i);
  });

  // -------------------------------------------------------------------------
  // Clinic claims
  // -------------------------------------------------------------------------

  it('lets a person claim an unowned listing only with documents they uploaded', async () => {
    const adminId = await user('admin@example.test');
    const claimantId = await user('claimant@example.test', 'dentist');
    const otherId = await user('other@example.test');
    const { organizationId } = await createListingOrganization(
      { name: 'Listed Clinic', slug: 'listed', type: 'CLINIC', countryCode: 'IN', timezone: 'Asia/Kolkata' },
      adminId,
    );

    const notMine = await evidenceFile(otherId);
    await expect(
      claimOrganization(organizationId, claimantId, { documentFileIds: [notMine], role: 'Owner' }),
    ).rejects.toThrow(/upload the documents yourself/i);

    const mine = await evidenceFile(claimantId);
    const { verificationRequestId } = await claimOrganization(organizationId, claimantId, {
      documentFileIds: [mine],
      role: 'Owner',
    });
    expect(verificationRequestId).toBeTruthy();

    await expect(
      claimOrganization(organizationId, claimantId, { documentFileIds: [mine], role: 'Owner' }),
    ).rejects.toThrow(/already awaiting review/i);
  });

  it('refuses a claim on an organization that is already managed', async () => {
    const clinic = await makeClinic('bright', 'owner@example.test');
    const claimantId = await user('claimant@example.test');
    const file = await evidenceFile(claimantId);
    await expect(
      claimOrganization(clinic.organizationId, claimantId, { documentFileIds: [file], role: 'Manager' }),
    ).rejects.toThrow(/already managed/i);
  });

  it('grants ownership on approval — never to a self-reviewer, and never twice', async () => {
    const adminId = await user('admin@example.test');
    const reviewerId = await makeReviewer('rev@example.test');
    const firstId = await user('first@example.test', 'dentist');
    const secondId = await user('second@example.test', 'dentist');
    const { organizationId } = await createListingOrganization(
      { name: 'Listed Clinic', slug: 'listed', type: 'CLINIC', countryCode: 'IN', timezone: 'Asia/Kolkata' },
      adminId,
    );

    const first = await claimOrganization(organizationId, firstId, {
      documentFileIds: [await evidenceFile(firstId)],
      role: 'Owner',
    });
    const second = await claimOrganization(organizationId, secondId, {
      documentFileIds: [await evidenceFile(secondId)],
      role: 'Also the owner, apparently',
    });

    await expect(
      reviewVerification({ verificationRequestId: first.verificationRequestId, decision: 'APPROVED' }, firstId),
    ).rejects.toThrow(/permission/i);

    await reviewVerification({ verificationRequestId: first.verificationRequestId, decision: 'APPROVED' }, reviewerId);
    const organization = await testDb().organization.findUniqueOrThrow({ where: { id: organizationId } });
    expect(organization.ownerUserId).toBe(firstId);
    const membership = await testDb().organizationMember.findFirstOrThrow({ where: { organizationId, userId: firstId } });
    expect(membership.roleKey).toBe('clinic_admin');

    // The competing claim cannot also be approved; its request stays undecided.
    await expect(
      reviewVerification({ verificationRequestId: second.verificationRequestId, decision: 'APPROVED' }, reviewerId),
    ).rejects.toThrow(/already has an owner/i);
    const stillPending = await testDb().verificationRequest.findUniqueOrThrow({ where: { id: second.verificationRequestId } });
    expect(stillPending.status).toBe('PENDING');
    expect(await testDb().organizationMember.count({ where: { organizationId } })).toBe(1);
  });

  it('lets a reviewer open claim evidence only while the claim awaits a decision', async () => {
    const adminId = await user('admin@example.test');
    const reviewerId = await makeReviewer('rev@example.test');
    const claimantId = await user('claimant@example.test');
    const { organizationId } = await createListingOrganization(
      { name: 'Listed Clinic', slug: 'listed', type: 'CLINIC', countryCode: 'IN', timezone: 'Asia/Kolkata' },
      adminId,
    );
    const cited = await evidenceFile(claimantId);
    const uncited = await evidenceFile(claimantId);
    const { verificationRequestId } = await claimOrganization(organizationId, claimantId, {
      documentFileIds: [cited],
      role: 'Owner',
    });

    const reviewer = principal(reviewerId, [], ['moderator']);
    const row = (id: string) => testDb().fileObject.findUniqueOrThrow({ where: { id } });

    expect(await canReadFile(reviewer, await row(cited))).toBe(true);
    // Being a reviewer is not a licence to read every certificate on the platform.
    expect(await canReadFile(reviewer, await row(uncited))).toBe(false);

    await reviewVerification(
      { verificationRequestId, decision: 'REJECTED', decisionReason: 'The certificate is illegible; upload a clearer scan.' },
      reviewerId,
    );
    // Decided: the evidence is the claimant's again.
    expect(await canReadFile(reviewer, await row(cited))).toBe(false);
  });

  it('gives the reviewer the organization, submitter, role and documents of a claim', async () => {
    const adminId = await user('admin@example.test');
    const claimantId = await user('claimant@example.test');
    const { organizationId } = await createListingOrganization(
      { name: 'Listed Clinic', slug: 'listed', type: 'CLINIC', countryCode: 'IN', timezone: 'Asia/Kolkata' },
      adminId,
    );
    const file = await evidenceFile(claimantId);
    await claimOrganization(organizationId, claimantId, { documentFileIds: [file], role: 'Managing partner' });

    const [entry] = await listPendingVerificationsForReview();
    expect(entry!.organization?.name).toBe('Listed Clinic');
    expect(entry!.organization?.ownerUserId).toBeNull();
    expect(entry!.submitter?.email).toBe('claimant@example.test');
    expect(entry!.claimRole).toBe('Managing partner');
    expect(entry!.documents).toEqual([{ fileId: file, purpose: 'CERTIFICATE' }]);
  });

  // -------------------------------------------------------------------------
  // Public clinic page data
  // -------------------------------------------------------------------------

  it('lists publicly only the dentists the clinic confirmed and search would show', async () => {
    const reviewerId = await makeReviewer('rev@example.test');
    const clinic = await makeClinic('bright', 'owner@example.test');
    const confirmed = await makeVerifiedDentist('confirmed@example.test', 'dr-confirmed', reviewerId);
    const unconfirmed = await makeVerifiedDentist('unconfirmed@example.test', 'dr-unconfirmed', reviewerId);

    const claim = await claimPractice(confirmed.userId, clinic.locationId);
    await confirmPractice(claim.practiceId, clinic.organizationId, clinic.ownerId);
    await claimPractice(unconfirmed.userId, clinic.locationId); // claimed, never confirmed

    const page = await getPublicClinic('bright');
    expect(page).not.toBeNull();
    expect(page!.isVerified).toBe(false);
    expect(page!.locations[0]!.dentists.map((d) => d.slug)).toEqual(['dr-confirmed']);
    // Decimal columns are converted, so maps and structured data get numbers.
    expect(typeof page!.locations[0]!.latitude).toBe('number');
  });

  it('treats an expired verification as unverified and does not resolve a suspended clinic', async () => {
    const clinic = await makeClinic('bright', 'owner@example.test');
    await testDb().organization.update({
      where: { id: clinic.organizationId },
      data: { verifiedAt: new Date('2020-01-01T00:00:00Z'), verificationExpires: new Date('2021-01-01T00:00:00Z') },
    });
    expect((await getPublicClinic('bright'))!.isVerified).toBe(false);

    await testDb().organization.update({ where: { id: clinic.organizationId }, data: { status: 'SUSPENDED' } });
    expect(await getPublicClinic('bright')).toBeNull();
  });

  it('omits permanently closed branches, and a clinic with none left does not resolve', async () => {
    const clinic = await makeClinic('bright', 'owner@example.test');
    await closeLocation(clinic.organizationId, clinic.locationId, clinic.ownerId);
    expect(await getPublicClinic('bright')).toBeNull();
  });
});

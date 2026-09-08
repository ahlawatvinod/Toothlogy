/**
 * TL-TEST-VERIFY-INTEGRATION-001 — Dentist profiles and verification
 *
 * The tests that matter most here are the ones protecting the TRUST pillar:
 *
 * - an unverified dentist never becomes discoverable
 * - a reviewer cannot approve their own application
 * - editing credentials after approval drops the badge
 * - revocation removes the dentist from search immediately
 *
 * Each of those is a silent failure mode: nothing errors, a patient is simply
 * matched with a dentist whose credentials were never checked.
 */

import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';
import { register } from '@/platform/auth/service';
import { createOrganization } from '@/platform/organizations/service';
import { createLocation } from '@/platform/organizations/locations';
import {
  addQualification,
  claimPractice,
  confirmPractice,
  getPublicDentistProfile,
  recomputeDiscoverability,
  submitForVerification,
  upsertDentistProfile,
} from '@/platform/dentists/service';
import {
  expireLapsedVerifications,
  getVerificationHistory,
  listPendingVerifications,
  reviewVerification,
  revokeVerification,
} from '@/platform/verification/service';
import {
  assertSeeded,
  describeIntegration,
  disconnectTestDb,
  resetDatabase,
  testDb,
  useDatabaseAuditSink,
} from '../helpers/database';

const PASSWORD = 'a sufficiently long passphrase';

async function makeDentist(email: string, slug: string) {
  const { userId } = await register({
    email,
    password: PASSWORD,
    displayName: 'Dr Test Dentist',
    role: 'dentist',
    acceptedTerms: true,
  });

  await upsertDentistProfile(userId, {
    slug,
    bio: 'A practising dentist with more than ten years of clinical experience in general and restorative dentistry.',
    languages: ['en', 'hi'],
    specialtyKeys: ['general_dentistry'],
  });

  await addQualification(userId, {
    degree: 'BDS',
    institution: 'Government Dental College',
    year: 2012,
    registrationNumber: 'DCI-12345',
    registrationBody: 'Dental Council of India',
  });

  return userId;
}

async function makeReviewer(email: string) {
  const { userId } = await register({
    email,
    password: PASSWORD,
    displayName: 'Reviewer',
    role: 'patient',
    acceptedTerms: true,
  });

  await testDb().roleAssignment.create({
    data: { id: `ra_${Date.now()}_${Math.random().toString(36).slice(2)}`, userId, roleKey: 'moderator' },
  });

  return userId;
}

describeIntegration('dentist verification (integration)', () => {
  beforeAll(async () => {
    await assertSeeded();
  });

  beforeEach(async () => {
    await resetDatabase();
    useDatabaseAuditSink();
  });

  afterAll(async () => {
    await disconnectTestDb();
  });

  // -------------------------------------------------------------------------
  // Profile lifecycle
  // -------------------------------------------------------------------------

  it('creates a profile in DRAFT and not discoverable', async () => {
    const userId = await makeDentist('d1@example.test', 'dr-one');

    const profile = await testDb().dentistProfile.findUnique({ where: { userId } });
    expect(profile!.status).toBe('DRAFT');
    expect(profile!.isVerified).toBe(false);
    expect(profile!.isDiscoverable).toBe(false);
  });

  it('rejects a duplicate profile slug', async () => {
    await makeDentist('d1@example.test', 'dr-shared');
    const { userId } = await register({
      email: 'd2@example.test',
      password: PASSWORD,
      displayName: 'Other',
      role: 'dentist',
      acceptedTerms: true,
    });

    await expect(
      upsertDentistProfile(userId, {
        slug: 'dr-shared',
        languages: [],
        specialtyKeys: [],
      }),
    ).rejects.toThrow(/already taken/i);
  });

  it('rejects an unsupported language or specialty', async () => {
    const { userId } = await register({
      email: 'd1@example.test',
      password: PASSWORD,
      displayName: 'D',
      role: 'dentist',
      acceptedTerms: true,
    });

    await expect(
      upsertDentistProfile(userId, { slug: 'dr-x', languages: ['zz'], specialtyKeys: [] }),
    ).rejects.toThrow(/not valid|not supported/i);

    await expect(
      upsertDentistProfile(userId, {
        slug: 'dr-x',
        languages: [],
        specialtyKeys: ['not_a_specialty'],
      }),
    ).rejects.toThrow(/not recognised/i);
  });

  it('refuses submission without a council registration number', async () => {
    // The registration number IS what verification checks. Without one there is
    // nothing to verify, and the reviewer would have to reject it anyway.
    const { userId } = await register({
      email: 'd1@example.test',
      password: PASSWORD,
      displayName: 'D',
      role: 'dentist',
      acceptedTerms: true,
    });

    await upsertDentistProfile(userId, {
      slug: 'dr-nonumber',
      bio: 'A practising dentist with more than ten years of clinical experience in restorative work.',
      languages: ['en'],
      specialtyKeys: [],
    });

    await addQualification(userId, {
      degree: 'BDS',
      institution: 'Some College',
      year: 2015,
    });

    await expect(submitForVerification(userId)).rejects.toThrow(/registration number/i);
  });

  it('refuses submission without a biography', async () => {
    const { userId } = await register({
      email: 'd1@example.test',
      password: PASSWORD,
      displayName: 'D',
      role: 'dentist',
      acceptedTerms: true,
    });

    await upsertDentistProfile(userId, { slug: 'dr-nobio', languages: [], specialtyKeys: [] });
    await addQualification(userId, {
      degree: 'BDS',
      institution: 'College',
      year: 2015,
      registrationNumber: 'DCI-1',
    });

    await expect(submitForVerification(userId)).rejects.toThrow(/biography/i);
  });

  it('refuses a duplicate submission while one is pending', async () => {
    const userId = await makeDentist('d1@example.test', 'dr-one');
    await submitForVerification(userId);

    await expect(submitForVerification(userId)).rejects.toThrow(/already awaiting review/i);
  });

  // -------------------------------------------------------------------------
  // Review — the trust boundary
  // -------------------------------------------------------------------------

  it('refuses to let a reviewer approve their own application', async () => {
    /*
     * The single most important test in this file.
     *
     * Toothlogy recruits reviewers from the dental profession, so a reviewer
     * who is also an applicant is the NORMAL case, not an edge case. Without
     * this check the verification badge would certify nothing.
     */
    const userId = await makeDentist('selfreviewer@example.test', 'dr-self');
    await testDb().roleAssignment.create({
      data: { id: 'ra_self', userId, roleKey: 'moderator' },
    });

    const { verificationRequestId } = await submitForVerification(userId);

    await expect(
      reviewVerification(
        { verificationRequestId, decision: 'APPROVED' },
        userId, // same person
      ),
    ).rejects.toThrow(/permission/i);

    const profile = await testDb().dentistProfile.findUnique({ where: { userId } });
    expect(profile!.isVerified).toBe(false);
  });

  it('records a denied self-review attempt in the audit trail', async () => {
    const userId = await makeDentist('selfreviewer@example.test', 'dr-self');
    const { verificationRequestId } = await submitForVerification(userId);

    await reviewVerification(
      { verificationRequestId, decision: 'APPROVED' },
      userId,
    ).catch(() => {});

    const denied = await testDb().auditEvent.findMany({
      where: { action: 'VERIFICATION_REVIEWED', outcome: 'DENIED' },
    });
    expect(denied.length).toBe(1);
  });

  it('requires a reason for a rejection', async () => {
    // A refusal the applicant cannot act on guarantees an identical
    // resubmission and a second wasted review.
    const userId = await makeDentist('d1@example.test', 'dr-one');
    const reviewerId = await makeReviewer('rev@example.test');
    const { verificationRequestId } = await submitForVerification(userId);

    await expect(
      reviewVerification({ verificationRequestId, decision: 'REJECTED' }, reviewerId),
    ).rejects.toThrow(/reason/i);
  });

  it('approves, sets an expiry, and verifies only credentialed qualifications', async () => {
    const userId = await makeDentist('d1@example.test', 'dr-one');
    const reviewerId = await makeReviewer('rev@example.test');

    // A second qualification with NO registration number: it was not
    // verifiable, so it must not inherit the badge.
    await addQualification(userId, {
      degree: 'Certificate in Implantology',
      institution: 'Private Institute',
      year: 2019,
    });

    const { verificationRequestId } = await submitForVerification(userId);
    const result = await reviewVerification(
      { verificationRequestId, decision: 'APPROVED' },
      reviewerId,
    );

    expect(result.status).toBe('APPROVED');
    expect(result.expiresAt).not.toBeNull();
    // Verification expires: a credential checked today is not evidence about
    // registration in five years.
    expect(result.expiresAt!.getTime()).toBeGreaterThan(Date.now());

    const profile = await testDb().dentistProfile.findUnique({
      where: { userId },
      include: { qualifications: true },
    });

    expect(profile!.isVerified).toBe(true);
    expect(profile!.status).toBe('VERIFIED');

    const verified = profile!.qualifications.filter((q) => q.isVerified);
    expect(verified).toHaveLength(1);
    expect(verified[0]!.registrationNumber).toBe('DCI-12345');
  });

  it('rejects with a reason the applicant can read', async () => {
    const userId = await makeDentist('d1@example.test', 'dr-one');
    const reviewerId = await makeReviewer('rev@example.test');
    const { verificationRequestId } = await submitForVerification(userId);

    await reviewVerification(
      {
        verificationRequestId,
        decision: 'REJECTED',
        decisionReason: 'The registration number could not be found on the DCI register.',
        reviewerNotes: 'Internal: checked twice against the register.',
      },
      reviewerId,
    );

    const profile = await testDb().dentistProfile.findUnique({ where: { userId } });
    expect(profile!.status).toBe('REJECTED');
    expect(profile!.isDiscoverable).toBe(false);

    const history = await getVerificationHistory('DENTIST', profile!.id);
    expect(history[0]!.decisionReason).toContain('DCI register');
    // Internal notes are never exposed to the applicant.
    expect(history[0]).not.toHaveProperty('reviewerNotes');
  });

  it('refuses to review a request twice', async () => {
    const userId = await makeDentist('d1@example.test', 'dr-one');
    const reviewerId = await makeReviewer('rev@example.test');
    const { verificationRequestId } = await submitForVerification(userId);

    await reviewVerification({ verificationRequestId, decision: 'APPROVED' }, reviewerId);
    await expect(
      reviewVerification({ verificationRequestId, decision: 'REJECTED', decisionReason: 'x'.repeat(20) }, reviewerId),
    ).rejects.toThrow(/already been/i);
  });

  // -------------------------------------------------------------------------
  // Discoverability — verification AND a locatable practice
  // -------------------------------------------------------------------------

  it('does not make a verified dentist discoverable without a confirmed practice', async () => {
    // Verified but unreachable. Surfacing them wastes a patient's time.
    const userId = await makeDentist('d1@example.test', 'dr-one');
    const reviewerId = await makeReviewer('rev@example.test');
    const { verificationRequestId } = await submitForVerification(userId);
    await reviewVerification({ verificationRequestId, decision: 'APPROVED' }, reviewerId);

    const profile = await testDb().dentistProfile.findUnique({ where: { userId } });
    expect(profile!.isVerified).toBe(true);
    expect(profile!.isDiscoverable).toBe(false);
  });

  it('becomes discoverable only after verification AND a confirmed, locatable practice', async () => {
    const dentistId = await makeDentist('d1@example.test', 'dr-one');
    const reviewerId = await makeReviewer('rev@example.test');
    const ownerId = (
      await register({
        email: 'clinic@example.test',
        password: PASSWORD,
        displayName: 'Clinic Owner',
        role: 'dentist',
        acceptedTerms: true,
      })
    ).userId;

    const { organizationId } = await createOrganization(
      {
        name: 'Bright Smile',
        slug: 'bright-smile',
        type: 'CLINIC',
        countryCode: 'IN',
        timezone: 'Asia/Kolkata',
      },
      ownerId,
    );

    const location = await createLocation(
      organizationId,
      {
        name: 'Main',
        slug: 'main',
        timezone: 'Asia/Kolkata',
        isPrimary: true,
        latitude: 21.2514,
        longitude: 81.6296,
      },
      ownerId,
    );

    const { verificationRequestId } = await submitForVerification(dentistId);
    await reviewVerification({ verificationRequestId, decision: 'APPROVED' }, reviewerId);

    const claim = await claimPractice(dentistId, location.locationId);
    // A claim alone is not enough: otherwise any dentist could claim to work
    // at any clinic and appear in its results.
    expect(claim.isConfirmed).toBe(false);
    let profile = await testDb().dentistProfile.findUnique({ where: { userId: dentistId } });
    expect(profile!.isDiscoverable).toBe(false);

    await confirmPractice(claim.practiceId, organizationId, ownerId);

    profile = await testDb().dentistProfile.findUnique({ where: { userId: dentistId } });
    expect(profile!.isDiscoverable).toBe(true);

    // And now the public profile resolves.
    const publicProfile = await getPublicDentistProfile('dr-one');
    expect(publicProfile).not.toBeNull();
    expect(publicProfile!.qualifications).toHaveLength(1);
  });

  it('is not discoverable when the only practice location has no coordinates', async () => {
    const dentistId = await makeDentist('d1@example.test', 'dr-one');
    const reviewerId = await makeReviewer('rev@example.test');
    const ownerId = (
      await register({
        email: 'clinic@example.test',
        password: PASSWORD,
        displayName: 'Owner',
        role: 'dentist',
        acceptedTerms: true,
      })
    ).userId;

    const { organizationId } = await createOrganization(
      { name: 'Clinic C', slug: 'clinic-c', type: 'CLINIC', countryCode: 'IN', timezone: 'Asia/Kolkata' },
      ownerId,
    );
    const location = await createLocation(
      organizationId,
      { name: 'No coords', slug: 'no-coords', timezone: 'Asia/Kolkata', isPrimary: true },
      ownerId,
    );

    const { verificationRequestId } = await submitForVerification(dentistId);
    await reviewVerification({ verificationRequestId, decision: 'APPROVED' }, reviewerId);

    const claim = await claimPractice(dentistId, location.locationId);
    await confirmPractice(claim.practiceId, organizationId, ownerId);

    // A distance-ranked search cannot place them anywhere.
    expect(await recomputeDiscoverability((await testDb().dentistProfile.findUnique({ where: { userId: dentistId } }))!.id)).toBe(false);
  });

  it('refuses a duplicate practice claim', async () => {
    const dentistId = await makeDentist('d1@example.test', 'dr-one');
    const ownerId = (
      await register({
        email: 'clinic@example.test',
        password: PASSWORD,
        displayName: 'Owner',
        role: 'dentist',
        acceptedTerms: true,
      })
    ).userId;
    const { organizationId } = await createOrganization(
      { name: 'Clinic C', slug: 'clinic-c', type: 'CLINIC', countryCode: 'IN', timezone: 'Asia/Kolkata' },
      ownerId,
    );
    const location = await createLocation(
      organizationId,
      { name: 'Main branch', slug: 'main-branch', timezone: 'Asia/Kolkata', isPrimary: true },
      ownerId,
    );

    await claimPractice(dentistId, location.locationId);
    await expect(claimPractice(dentistId, location.locationId)).rejects.toThrow(/already claimed/i);
  });

  it('does not let a clinic confirm a practice at another clinic’s location', async () => {
    const dentistId = await makeDentist('d1@example.test', 'dr-one');
    const ownerA = (await register({ email: 'a@example.test', password: PASSWORD, displayName: 'A', role: 'dentist', acceptedTerms: true })).userId;
    const ownerB = (await register({ email: 'b@example.test', password: PASSWORD, displayName: 'B', role: 'dentist', acceptedTerms: true })).userId;

    const orgA = await createOrganization({ name: 'Clinic A', slug: 'clinic-a', type: 'CLINIC', countryCode: 'IN', timezone: 'Asia/Kolkata' }, ownerA);
    const orgB = await createOrganization({ name: 'Clinic B', slug: 'clinic-b', type: 'CLINIC', countryCode: 'IN', timezone: 'Asia/Kolkata' }, ownerB);

    const locationA = await createLocation(
      orgA.organizationId,
      { name: 'A main', slug: 'a-main', timezone: 'Asia/Kolkata', isPrimary: true },
      ownerA,
    );

    const claim = await claimPractice(dentistId, locationA.locationId);

    // Clinic B must not be able to confirm a practice at clinic A's location.
    await expect(
      confirmPractice(claim.practiceId, orgB.organizationId, ownerB),
    ).rejects.toThrow(/not found/i);
  });

  // -------------------------------------------------------------------------
  // Credential changes after approval
  // -------------------------------------------------------------------------

  it('drops verification when a qualification is added after approval', async () => {
    /*
     * Without this, a dentist verified on a BDS could append an unverified MDS
     * and inherit the badge for it — the badge would certify whatever they
     * last typed rather than what was checked.
     */
    const userId = await makeDentist('d1@example.test', 'dr-one');
    const reviewerId = await makeReviewer('rev@example.test');
    const { verificationRequestId } = await submitForVerification(userId);
    await reviewVerification({ verificationRequestId, decision: 'APPROVED' }, reviewerId);

    const result = await addQualification(userId, {
      degree: 'MDS Orthodontics',
      institution: 'Another College',
      year: 2020,
      registrationNumber: 'DCI-99999',
    });

    expect(result.verificationCleared).toBe(true);

    const profile = await testDb().dentistProfile.findUnique({ where: { userId } });
    expect(profile!.isVerified).toBe(false);
    expect(profile!.status).toBe('SUBMITTED');
    expect(profile!.isDiscoverable).toBe(false);
  });

  // -------------------------------------------------------------------------
  // Revocation and expiry
  // -------------------------------------------------------------------------

  it('revokes a verification and removes the dentist from search immediately', async () => {
    const userId = await makeDentist('d1@example.test', 'dr-one');
    const reviewerId = await makeReviewer('rev@example.test');
    const { verificationRequestId } = await submitForVerification(userId);
    await reviewVerification({ verificationRequestId, decision: 'APPROVED' }, reviewerId);

    await revokeVerification(
      verificationRequestId,
      'Dental council registration was withdrawn on 2026-06-01.',
      reviewerId,
    );

    const profile = await testDb().dentistProfile.findUnique({
      where: { userId },
      include: { qualifications: true },
    });

    expect(profile!.isVerified).toBe(false);
    expect(profile!.status).toBe('SUSPENDED');
    expect(profile!.isDiscoverable).toBe(false);
    // Qualification badges are withdrawn too.
    expect(profile!.qualifications.every((q) => !q.isVerified)).toBe(true);

    // And the public profile stops resolving.
    expect(await getPublicDentistProfile('dr-one')).toBeNull();
  });

  it('requires a substantive reason to revoke', async () => {
    const userId = await makeDentist('d1@example.test', 'dr-one');
    const reviewerId = await makeReviewer('rev@example.test');
    const { verificationRequestId } = await submitForVerification(userId);
    await reviewVerification({ verificationRequestId, decision: 'APPROVED' }, reviewerId);

    // This record is the evidence if the decision is challenged.
    await expect(revokeVerification(verificationRequestId, 'no', reviewerId)).rejects.toThrow(
      /reason/i,
    );
  });

  it('preserves the revocation in history rather than deleting it', async () => {
    const userId = await makeDentist('d1@example.test', 'dr-one');
    const reviewerId = await makeReviewer('rev@example.test');
    const { verificationRequestId } = await submitForVerification(userId);
    await reviewVerification({ verificationRequestId, decision: 'APPROVED' }, reviewerId);
    await revokeVerification(verificationRequestId, 'Registration withdrawn by council.', reviewerId);

    const profile = await testDb().dentistProfile.findUnique({ where: { userId } });
    const history = await getVerificationHistory('DENTIST', profile!.id);

    expect(history[0]!.status).toBe('REVOKED');
    expect(history[0]!.revocationReason).toContain('withdrawn');
  });

  it('expires lapsed verifications and removes them from search', async () => {
    const userId = await makeDentist('d1@example.test', 'dr-one');
    const reviewerId = await makeReviewer('rev@example.test');
    const { verificationRequestId } = await submitForVerification(userId);
    await reviewVerification({ verificationRequestId, decision: 'APPROVED' }, reviewerId);

    // Backdate the expiry to simulate a lapsed registration.
    await testDb().verificationRequest.update({
      where: { id: verificationRequestId },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

    const expired = await expireLapsedVerifications();
    expect(expired).toBe(1);

    const profile = await testDb().dentistProfile.findUnique({ where: { userId } });
    expect(profile!.isVerified).toBe(false);
    expect(profile!.isDiscoverable).toBe(false);
  });

  // -------------------------------------------------------------------------
  // Queue
  // -------------------------------------------------------------------------

  it('lists pending requests oldest first', async () => {
    const first = await makeDentist('d1@example.test', 'dr-one');
    const second = await makeDentist('d2@example.test', 'dr-two');

    await submitForVerification(first);
    await submitForVerification(second);

    const pending = await listPendingVerifications();
    expect(pending).toHaveLength(2);
    // A backlog must drain in the order it accumulated.
    expect(pending[0]!.submittedAt.getTime()).toBeLessThanOrEqual(
      pending[1]!.submittedAt.getTime(),
    );
  });
});

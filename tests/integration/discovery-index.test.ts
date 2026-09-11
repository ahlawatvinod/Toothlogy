/**
 * TL-TEST-DISCOVERY-INDEX-001 — What search is allowed to show
 *
 * The index is the last gate between the trust rules and a patient's screen.
 * These tests hold it to them: nothing unverified or unconfirmed is published,
 * a dentist is found near each branch they practise at and not elsewhere,
 * closing a branch withdraws them at once, and a clinic appears only while its
 * verification is current. Every organic result is `promoted: false`.
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
import { reviewVerification } from '@/platform/verification/service';
import { createOffering } from '@/platform/organizations/offerings';
import { closeLocation } from '@/platform/organizations/location-management';
import { runSearch } from '@/platform/search/service';
import {
  dentistQualityScore,
  reindexAll,
  reindexOrganization,
} from '@/platform/discovery/indexer';
import {
  assertSeeded,
  describeIntegration,
  disconnectTestDb,
  resetDatabase,
  testDb,
  useDatabaseAuditSink,
} from '../helpers/database';

const PASSWORD = 'a sufficiently long passphrase';
const RAIPUR = { latitude: 21.2514, longitude: 81.6296 };
const DELHI = { latitude: 28.6139, longitude: 77.209 };

async function user(email: string, displayName: string, role: 'dentist' | 'patient' = 'dentist') {
  return (await register({ email, password: PASSWORD, displayName, role, acceptedTerms: true })).userId;
}

async function reviewer() {
  const userId = await user('rev@example.test', 'Reviewer', 'patient');
  await testDb().roleAssignment.create({
    data: { id: `ra_${Math.random().toString(36).slice(2)}`, userId, roleKey: 'moderator' },
  });
  return userId;
}

async function clinic(slug: string, point: { latitude: number; longitude: number }) {
  const ownerId = await user(`owner-${slug}@example.test`, `Owner ${slug}`);
  const { organizationId } = await createOrganization(
    { name: `Clinic ${slug}`, slug, type: 'CLINIC', countryCode: 'IN', timezone: 'Asia/Kolkata' },
    ownerId,
  );
  const { locationId } = await createLocation(
    organizationId,
    {
      name: 'Main',
      slug: 'main',
      timezone: 'Asia/Kolkata',
      isPrimary: true,
      ...point,
      address: { lines: ['1 Main Road'], locality: slug === 'delhi' ? 'New Delhi' : 'Raipur', countryCode: 'IN' },
    },
    ownerId,
  );
  return { ownerId, organizationId, locationId };
}

async function verifiedDentist(email: string, name: string, slug: string, reviewerId: string, languages = ['en', 'hi']) {
  const userId = await user(email, name);
  await upsertDentistProfile(userId, {
    slug,
    headline: 'Endodontist in Raipur',
    bio: 'A practising dentist with more than ten years of clinical experience in general and restorative dentistry.',
    languages,
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
  return userId;
}

const dentistDocs = () => testDb().searchDocument.findMany({ where: { entityType: 'dentist' } });

describeIntegration('discovery index (integration)', () => {
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

  it('publishes a dentist only once verified AND confirmed at a located branch', async () => {
    const reviewerId = await reviewer();
    const raipur = await clinic('raipur', RAIPUR);
    const dentistId = await verifiedDentist('asha@example.test', 'Asha Verma', 'dr-asha', reviewerId);

    // Verified, but the practice is only claimed.
    const { practiceId } = await claimPractice(dentistId, raipur.locationId);
    expect(await dentistDocs()).toHaveLength(0);

    await confirmPractice(practiceId, raipur.organizationId, raipur.ownerId);
    const docs = await dentistDocs();
    expect(docs).toHaveLength(1);
    expect(docs[0]!.entityId).toBe(practiceId);
    expect((docs[0]!.facets as Record<string, unknown>).slug).toBe('dr-asha');
  });

  it('never publishes an unverified dentist, even with a confirmed practice', async () => {
    const raipur = await clinic('raipur', RAIPUR);
    const dentistId = await user('unverified@example.test', 'Ravi Kumar');
    await upsertDentistProfile(dentistId, { slug: 'dr-ravi', languages: ['en'], specialtyKeys: [] });
    const { practiceId } = await claimPractice(dentistId, raipur.locationId);
    await confirmPractice(practiceId, raipur.organizationId, raipur.ownerId);

    expect(await dentistDocs()).toHaveLength(0);
    await reindexAll();
    expect(await dentistDocs()).toHaveLength(0);
  });

  it('finds a dentist near each branch, not elsewhere, and never as promoted', async () => {
    const reviewerId = await reviewer();
    const raipur = await clinic('raipur', RAIPUR);
    const delhi = await clinic('delhi', DELHI);
    const dentistId = await verifiedDentist('asha@example.test', 'Asha Verma', 'dr-asha', reviewerId);
    const a = await claimPractice(dentistId, raipur.locationId);
    await confirmPractice(a.practiceId, raipur.organizationId, raipur.ownerId);

    const nearRaipur = await runSearch({ type: 'dentist', geo: { centre: RAIPUR, radiusMetres: 5_000 }, limit: 10 });
    expect(nearRaipur.hits.map((h) => h.id)).toEqual([a.practiceId]);
    expect(nearRaipur.hits.every((h) => h.promoted === false)).toBe(true);

    const nearDelhi = await runSearch({ type: 'dentist', geo: { centre: DELHI, radiusMetres: 25_000 }, limit: 10 });
    expect(nearDelhi.hits).toHaveLength(0);

    // A second confirmed branch in Delhi: now found there too.
    const b = await claimPractice(dentistId, delhi.locationId);
    await confirmPractice(b.practiceId, delhi.organizationId, delhi.ownerId);
    const again = await runSearch({ type: 'dentist', geo: { centre: DELHI, radiusMetres: 25_000 }, limit: 10 });
    expect(again.hits.map((h) => h.id)).toEqual([b.practiceId]);
  });

  it('filters by language and by the treatments offered at the branch', async () => {
    const reviewerId = await reviewer();
    const raipur = await clinic('raipur', RAIPUR);
    const hindi = await verifiedDentist('hi@example.test', 'Asha Verma', 'dr-asha', reviewerId, ['en', 'hi']);
    const english = await verifiedDentist('en@example.test', 'John Mathew', 'dr-john', reviewerId, ['en']);
    for (const id of [hindi, english]) {
      const { practiceId } = await claimPractice(id, raipur.locationId);
      await confirmPractice(practiceId, raipur.organizationId, raipur.ownerId);
    }

    const hindiSpeakers = await runSearch({
      type: 'dentist',
      filters: [{ field: 'language', operator: 'eq', value: 'hi' }],
      limit: 10,
    });
    expect(hindiSpeakers.hits.map((h) => (h.source as { title: string }).title)).toEqual(['Asha Verma']);

    const rootCanalBefore = await runSearch({
      type: 'dentist',
      filters: [{ field: 'treatment', operator: 'eq', value: 'root_canal_treatment' }],
      limit: 10,
    });
    expect(rootCanalBefore.hits).toHaveLength(0);

    await createOffering(raipur.organizationId, { locationId: raipur.locationId, treatmentKey: 'root_canal_treatment', priceMinor: 450_000 }, raipur.ownerId);
    const rootCanalAfter = await runSearch({
      type: 'dentist',
      filters: [{ field: 'treatment', operator: 'eq', value: 'root_canal_treatment' }],
      facets: ['language'],
      limit: 10,
    });
    expect(rootCanalAfter.hits).toHaveLength(2);
    expect(rootCanalAfter.facets.language?.find((f) => f.value === 'hi')?.count).toBe(1);
  });

  it('withdraws a dentist the moment their only branch closes', async () => {
    const reviewerId = await reviewer();
    const raipur = await clinic('raipur', RAIPUR);
    const dentistId = await verifiedDentist('asha@example.test', 'Asha Verma', 'dr-asha', reviewerId);
    const { practiceId } = await claimPractice(dentistId, raipur.locationId);
    await confirmPractice(practiceId, raipur.organizationId, raipur.ownerId);
    expect(await dentistDocs()).toHaveLength(1);

    await closeLocation(raipur.organizationId, raipur.locationId, raipur.ownerId);
    expect(await dentistDocs()).toHaveLength(0);
  });

  it('indexes a clinic only while its verification is current', async () => {
    const raipur = await clinic('raipur', RAIPUR);
    await reindexOrganization(raipur.organizationId);
    expect(await testDb().searchDocument.count({ where: { entityType: 'clinic' } })).toBe(0);

    await testDb().organization.update({
      where: { id: raipur.organizationId },
      data: { verifiedAt: new Date(), verificationExpires: new Date(Date.now() + 86_400_000) },
    });
    await reindexOrganization(raipur.organizationId);
    const [doc] = await testDb().searchDocument.findMany({ where: { entityType: 'clinic' } });
    expect(doc?.entityId).toBe(raipur.organizationId);
    expect((doc?.facets as Record<string, unknown>).verified).toBe('true');

    await testDb().organization.update({
      where: { id: raipur.organizationId },
      data: { verificationExpires: new Date(Date.now() - 1000) },
    });
    await reindexOrganization(raipur.organizationId);
    expect(await testDb().searchDocument.count({ where: { entityType: 'clinic' } })).toBe(0);
  });

  it('rebuilds a wiped index from the database', async () => {
    const reviewerId = await reviewer();
    const raipur = await clinic('raipur', RAIPUR);
    const dentistId = await verifiedDentist('asha@example.test', 'Asha Verma', 'dr-asha', reviewerId);
    const { practiceId } = await claimPractice(dentistId, raipur.locationId);
    await confirmPractice(practiceId, raipur.organizationId, raipur.ownerId);

    await testDb().searchDocument.deleteMany({});
    const result = await reindexAll();
    expect(result.dentistsPublished).toBe(1);
    expect((await dentistDocs()).map((d) => d.entityId)).toEqual([practiceId]);
  });

  it('scores merit only, between 0 and 1', () => {
    const base = { practisingSince: 2012, bio: 'x'.repeat(60), headline: 'Endodontist', hasFee: true, languages: 2 };
    const one = dentistQualityScore({ ...base, verifiedQualifications: 1 }, new Date('2026-01-01'));
    const three = dentistQualityScore({ ...base, verifiedQualifications: 3 }, new Date('2026-01-01'));
    expect(three).toBeGreaterThan(one);
    expect(three).toBeLessThanOrEqual(1);
    expect(dentistQualityScore({ verifiedQualifications: 0, practisingSince: null, bio: null, headline: null, hasFee: false, languages: 0 })).toBe(0);
  });
});

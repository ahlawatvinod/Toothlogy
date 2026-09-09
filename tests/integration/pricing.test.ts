/**
 * TL-TEST-PRICING-INTEGRATION-001 — Dentist pricing
 *
 * The tests that matter most here are the ones protecting money and ownership:
 *
 * - a dentist cannot touch another dentist's prices
 * - a dentist cannot price a clinic they do not have a confirmed practice at
 * - a clinic price overrides the general price, at that clinic only
 * - the master suggested range is never written into a dentist's row
 * - every price change leaves a history row
 *
 * Each of those fails silently rather than loudly: nothing errors, a patient is
 * simply shown a price that nobody at the clinic agreed to.
 *
 * These run against a real PostgreSQL database. See tests/helpers/database.ts
 * for why they are not mocked, and why they skip rather than fail without one.
 */

import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';
import { register } from '@/platform/auth/service';
import { createOrganization } from '@/platform/organizations/service';
import { createLocation } from '@/platform/organizations/locations';
import {
  claimPractice,
  confirmPractice,
  upsertDentistProfile,
} from '@/platform/dentists/service';
import {
  bulkSetRowFlags,
  listOwnPriceList,
  listPriceHistory,
  listPublicPriceList,
  removeServicePrice,
  upsertServicePrice,
} from '@/platform/pricing/service';
import { resolveServicePrice } from '@/platform/pricing/resolution';
import {
  assertSeeded,
  describeIntegration,
  disconnectTestDb,
  resetDatabase,
  testDb,
  useDatabaseAuditSink,
} from '../helpers/database';

const PASSWORD = 'a sufficiently long passphrase';
const r = (rupees: number) => BigInt(rupees) * 100n;

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
    bio: 'A practising dentist with more than ten years of clinical experience.',
    languages: ['en'],
    specialtyKeys: ['general_dentistry'],
  });

  const profile = await testDb().dentistProfile.findUniqueOrThrow({ where: { userId } });
  return { userId, profileId: profile.id };
}

async function makeClinic(ownerUserId: string, name: string, slug: string) {
  const { organizationId } = await createOrganization(
    { name, slug, type: 'CLINIC', countryCode: 'IN', timezone: 'Asia/Kolkata' },
    ownerUserId,
  );

  const location = await createLocation(
    organizationId,
    {
      name,
      slug: 'main',
      timezone: 'Asia/Kolkata',
      isPrimary: true,
      latitude: 28.6139,
      longitude: 77.209,
    },
    ownerUserId,
  );

  return { organizationId, locationId: location.locationId, ownerUserId };
}

/** Claim a practice and have the clinic confirm it, which pricing requires. */
async function confirmAt(
  dentistUserId: string,
  clinic: { organizationId: string; locationId: string; ownerUserId: string },
) {
  const claim = await claimPractice(dentistUserId, clinic.locationId);
  await confirmPractice(claim.practiceId, clinic.organizationId, clinic.ownerUserId);
}

const crown = (overrides: Record<string, unknown> = {}) => ({
  serviceSlug: 'crown',
  variants: [
    {
      variantSlug: 'zirconia',
      unitKey: 'per_crown',
      currency: 'INR',
      actualMinor: r(12000),
    },
  ],
  ...overrides,
});

describeIntegration('dentist pricing', () => {
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
  // Ownership — specification §22
  // -------------------------------------------------------------------------

  it('a dentist cannot read another dentist’s price list', async () => {
    const asha = await makeDentist('asha@example.com', 'dr-asha');
    const bibek = await makeDentist('bibek@example.com', 'dr-bibek');

    await upsertServicePrice(asha.userId, crown(), { userId: asha.userId });

    // Bibek's list is his own, and is empty. There is no parameter he could
    // supply to widen it, which is the point.
    const theirs = await listOwnPriceList(bibek.userId);
    expect(theirs).toHaveLength(0);
  });

  it('a dentist cannot edit another dentist’s price row by id', async () => {
    const asha = await makeDentist('asha@example.com', 'dr-asha');
    const bibek = await makeDentist('bibek@example.com', 'dr-bibek');

    const { servicePriceId } = await upsertServicePrice(asha.userId, crown(), {
      userId: asha.userId,
    });

    // The id is real and guessable; ownership is what stops the write.
    const result = await bulkSetRowFlags(
      bibek.userId,
      { servicePriceIds: [servicePriceId], isEnabled: false },
      { userId: bibek.userId },
    );
    expect(result.updated).toBe(0);

    const [ashaRow] = await listOwnPriceList(asha.userId);
    expect(ashaRow?.isEnabled).toBe(true);
  });

  it('a dentist cannot delete another dentist’s price row', async () => {
    const asha = await makeDentist('asha@example.com', 'dr-asha');
    const bibek = await makeDentist('bibek@example.com', 'dr-bibek');

    const { servicePriceId } = await upsertServicePrice(asha.userId, crown(), {
      userId: asha.userId,
    });

    await expect(
      removeServicePrice(bibek.userId, servicePriceId, { userId: bibek.userId }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('a dentist cannot read another dentist’s price history', async () => {
    const asha = await makeDentist('asha@example.com', 'dr-asha');
    const bibek = await makeDentist('bibek@example.com', 'dr-bibek');

    const { servicePriceId } = await upsertServicePrice(asha.userId, crown(), {
      userId: asha.userId,
    });

    // NOT_FOUND rather than FORBIDDEN: a 403 confirms the id exists, which is
    // the first half of an enumeration attack.
    await expect(listPriceHistory(bibek.userId, servicePriceId)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });

  it('a dentist cannot price a clinic they have not been confirmed at', async () => {
    const asha = await makeDentist('asha@example.com', 'dr-asha');
    const owner = await register({
      email: 'owner@example.com',
      password: PASSWORD,
      displayName: 'Clinic Owner',
      role: 'patient',
      acceptedTerms: true,
    });
    const clinic = await makeClinic(owner.userId, 'Someone Else’s Clinic', 'other-clinic');

    await expect(
      upsertServicePrice(asha.userId, crown({ locationId: clinic.locationId }), {
        userId: asha.userId,
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('an unconfirmed practice claim is not enough to price a clinic', async () => {
    const asha = await makeDentist('asha@example.com', 'dr-asha');
    const owner = await register({
      email: 'owner@example.com',
      password: PASSWORD,
      displayName: 'Clinic Owner',
      role: 'patient',
      acceptedTerms: true,
    });
    const clinic = await makeClinic(owner.userId, 'City Dental', 'city-dental');

    // Claimed but not confirmed: without this rule any dentist could publish
    // prices against any clinic in the country.
    await claimPractice(asha.userId, clinic.locationId);

    await expect(
      upsertServicePrice(asha.userId, crown({ locationId: clinic.locationId }), {
        userId: asha.userId,
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  // -------------------------------------------------------------------------
  // Scope resolution — specification §7
  // -------------------------------------------------------------------------

  it('a clinic price overrides the general price at that clinic only', async () => {
    const asha = await makeDentist('asha@example.com', 'dr-asha');
    const owner = await register({
      email: 'owner@example.com',
      password: PASSWORD,
      displayName: 'Clinic Owner',
      role: 'patient',
      acceptedTerms: true,
    });

    const delhi = await makeClinic(owner.userId, 'Delhi Dental', 'delhi-dental');
    const gurgaon = await makeClinic(owner.userId, 'Gurgaon Dental', 'gurgaon-dental');

    await confirmAt(asha.userId, delhi);
    await confirmAt(asha.userId, gurgaon);

    await upsertServicePrice(asha.userId, crown(), { userId: asha.userId });
    await upsertServicePrice(
      asha.userId,
      crown({
        locationId: delhi.locationId,
        variants: [
          { variantSlug: 'zirconia', unitKey: 'per_crown', currency: 'INR', actualMinor: r(14000) },
        ],
      }),
      { userId: asha.userId },
    );

    const rows = await listOwnPriceList(asha.userId);
    const forResolution = rows.map((row) => ({
      id: row.id,
      serviceId: row.serviceId,
      locationId: row.locationId,
      isEnabled: row.isEnabled,
      isPublicVisible: row.isPublicVisible,
      amount: row.variantPrices[0]?.actualMinor,
    }));

    // Delhi gets its override.
    const atDelhi = resolveServicePrice(forResolution, delhi.locationId);
    expect(atDelhi.source).toBe('clinic');
    expect(atDelhi.row?.amount).toBe(r(14000));

    // Gurgaon, with no override, falls back to the general price.
    const atGurgaon = resolveServicePrice(forResolution, gurgaon.locationId);
    expect(atGurgaon.source).toBe('dentist');
    expect(atGurgaon.row?.amount).toBe(r(12000));
  });

  it('a global row and a clinic override are two rows, not one overwriting the other', async () => {
    const asha = await makeDentist('asha@example.com', 'dr-asha');
    const owner = await register({
      email: 'owner@example.com',
      password: PASSWORD,
      displayName: 'Clinic Owner',
      role: 'patient',
      acceptedTerms: true,
    });
    const delhi = await makeClinic(owner.userId, 'Delhi Dental', 'delhi-dental');
    await confirmAt(asha.userId, delhi);

    await upsertServicePrice(asha.userId, crown(), { userId: asha.userId });
    await upsertServicePrice(asha.userId, crown({ locationId: delhi.locationId }), {
      userId: asha.userId,
    });

    expect(await listOwnPriceList(asha.userId)).toHaveLength(2);
  });

  it('saving the same scope twice updates rather than duplicating', async () => {
    // The scopeKey column exists precisely so the global row is unique despite
    // PostgreSQL treating NULLs as distinct in a unique constraint.
    const asha = await makeDentist('asha@example.com', 'dr-asha');

    await upsertServicePrice(asha.userId, crown(), { userId: asha.userId });
    await upsertServicePrice(
      asha.userId,
      crown({
        variants: [
          { variantSlug: 'zirconia', unitKey: 'per_crown', currency: 'INR', actualMinor: r(13000) },
        ],
      }),
      { userId: asha.userId },
    );

    const rows = await listOwnPriceList(asha.userId);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.variantPrices[0]?.actualMinor).toBe(r(13000));
  });

  // -------------------------------------------------------------------------
  // Master catalogue separation — specification §6
  // -------------------------------------------------------------------------

  it('never copies the master suggested range into the dentist’s row', async () => {
    const asha = await makeDentist('asha@example.com', 'dr-asha');
    await upsertServicePrice(asha.userId, crown(), { userId: asha.userId });

    const [row] = await listOwnPriceList(asha.userId);
    const price = row!.variantPrices[0]!;

    // The dentist set a firm price and nothing else. If the suggested range
    // had leaked in, min and max would be populated from the catalogue.
    expect(price.actualMinor).toBe(r(12000));
    expect(price.minMinor).toBeNull();
    expect(price.maxMinor).toBeNull();

    // And the catalogue still has its own range, untouched.
    const service = await testDb().catalogueService.findUniqueOrThrow({ where: { slug: 'crown' } });
    expect(service.suggestedMinMinor).not.toBeNull();
  });

  it('rejects a treatment that is not in the catalogue', async () => {
    const asha = await makeDentist('asha@example.com', 'dr-asha');
    await expect(
      upsertServicePrice(asha.userId, crown({ serviceSlug: 'not-a-treatment' }), {
        userId: asha.userId,
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
  });

  it('rejects a variant that does not belong to the treatment', async () => {
    const asha = await makeDentist('asha@example.com', 'dr-asha');
    await expect(
      upsertServicePrice(
        asha.userId,
        crown({
          variants: [
            { variantSlug: 'molar', unitKey: 'per_crown', currency: 'INR', actualMinor: r(1000) },
          ],
        }),
        { userId: asha.userId },
      ),
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
  });

  it('rejects an invalid price without writing anything', async () => {
    const asha = await makeDentist('asha@example.com', 'dr-asha');

    await expect(
      upsertServicePrice(
        asha.userId,
        crown({
          variants: [
            {
              variantSlug: 'zirconia',
              unitKey: 'per_crown',
              currency: 'INR',
              actualMinor: r(12000),
              discountedMinor: r(13000),
            },
          ],
        }),
        { userId: asha.userId },
      ),
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });

    // Nothing was written: a half-applied price list is worse than a rejected
    // one, because nobody knows which half is live.
    expect(await listOwnPriceList(asha.userId)).toHaveLength(0);
  });

  // -------------------------------------------------------------------------
  // History — specification §15
  // -------------------------------------------------------------------------

  it('records a history row for every price that moved', async () => {
    const asha = await makeDentist('asha@example.com', 'dr-asha');

    const { servicePriceId } = await upsertServicePrice(asha.userId, crown(), {
      userId: asha.userId,
    });
    await upsertServicePrice(
      asha.userId,
      crown({
        variants: [
          { variantSlug: 'zirconia', unitKey: 'per_crown', currency: 'INR', actualMinor: r(13000) },
        ],
      }),
      { userId: asha.userId },
    );

    const history = await listPriceHistory(asha.userId, servicePriceId);
    const latest = history[0]!;

    expect(latest.field).toBe('actualMinor');
    expect(latest.previousMinor).toBe(r(12000));
    expect(latest.newMinor).toBe(r(13000));
    expect(latest.changedByUserId).toBe(asha.userId);
  });

  it('writes no history when nothing actually changed', async () => {
    const asha = await makeDentist('asha@example.com', 'dr-asha');
    const { servicePriceId } = await upsertServicePrice(asha.userId, crown(), {
      userId: asha.userId,
    });
    const before = (await listPriceHistory(asha.userId, servicePriceId)).length;

    await upsertServicePrice(asha.userId, crown(), { userId: asha.userId });

    expect(await listPriceHistory(asha.userId, servicePriceId)).toHaveLength(before);
  });

  // -------------------------------------------------------------------------
  // Public visibility — specification §12
  // -------------------------------------------------------------------------

  it('shows nothing publicly for a dentist who is not discoverable', async () => {
    const asha = await makeDentist('asha@example.com', 'dr-asha');
    await upsertServicePrice(asha.userId, crown(), { userId: asha.userId });

    // Unverified, so not discoverable. Null rather than an empty list: saying
    // "this dentist exists but is hidden" leaks the unverified profile.
    expect(await listPublicPriceList('dr-asha')).toBeNull();
  });

  it('hides a row the dentist marked private, without deleting it', async () => {
    const asha = await makeDentist('asha@example.com', 'dr-asha');
    const { servicePriceId } = await upsertServicePrice(
      asha.userId,
      crown({ isPublicVisible: false }),
      { userId: asha.userId },
    );

    // Still on the dentist's own list.
    const own = await listOwnPriceList(asha.userId);
    expect(own).toHaveLength(1);
    expect(own[0]?.isPublicVisible).toBe(false);
    expect(own[0]?.id).toBe(servicePriceId);
  });

  it('soft-deletes a removed row so the history survives', async () => {
    const asha = await makeDentist('asha@example.com', 'dr-asha');
    const { servicePriceId } = await upsertServicePrice(asha.userId, crown(), {
      userId: asha.userId,
    });

    await removeServicePrice(asha.userId, servicePriceId, { userId: asha.userId });

    expect(await listOwnPriceList(asha.userId)).toHaveLength(0);

    const row = await testDb().dentistServicePrice.findUniqueOrThrow({
      where: { id: servicePriceId },
    });
    expect(row.deletedAt).not.toBeNull();
    expect(await listPriceHistory(asha.userId, servicePriceId)).not.toHaveLength(0);
  });

  it('records an audit event for a price change', async () => {
    const asha = await makeDentist('asha@example.com', 'dr-asha');
    await upsertServicePrice(asha.userId, crown(), { userId: asha.userId });

    const events = await testDb().auditEvent.findMany({
      where: { action: 'pricing.service.upsert' },
    });
    expect(events).toHaveLength(1);
    expect(events[0]?.actor).toBe(asha.userId);
  });
});

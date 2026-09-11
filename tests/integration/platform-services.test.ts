/**
 * TL-TEST-PLATFORM-SERVICES-001 — Files, search, geography, preferences and
 * organization management against a real database and a real local disk.
 */

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';
import { register } from '@/platform/auth/service';
import { resolveSession, SESSION_COOKIE } from '@/platform/auth/session';
import { createOrganization, inviteToOrganization, acceptInvitation } from '@/platform/organizations/service';
import { createLocation } from '@/platform/organizations/locations';
import {
  removeOrganizationMember,
  setMemberRole,
  submitOrganizationVerification,
  transferOwnership,
  updateOrganizationProfile,
} from '@/platform/organizations/management';
import { createDownloadUrl, deleteFile, purgeDeletedFiles, uploadFile } from '@/platform/storage/files';
import { storageProvider } from '@/platform/storage/ports';
import { indexDocuments, runSearch } from '@/platform/search/service';
import { geocode, reverseGeocode } from '@/platform/location/geocoding';
import {
  getNotificationPreferences,
  getPreferences,
  setConsent,
  listConsents,
  unsubscribeLink,
  unsubscribeFromLink,
  updatePreferences,
  updateProfile,
} from '@/platform/users/preferences';
import { GET as fileContent } from '@/app/api/v1/files/content/route';
import { GET as publicFile } from '@/app/api/v1/files/[id]/public/route';
import type { Principal } from '@/platform/rbac';
import {
  assertSeeded,
  describeIntegration,
  disconnectTestDb,
  resetDatabase,
  testDb,
  useDatabaseAuditSink,
} from '../helpers/database';

const PASSWORD = 'a sufficiently long passphrase';
const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]);
const PDF = new TextEncoder().encode('%PDF-1.7\n%test\n');

let storageDir = '';

async function userWithPrincipal(email: string) {
  const { userId, session } = await register({
    email,
    password: PASSWORD,
    displayName: email.split('@')[0]!,
    role: 'patient',
    acceptedTerms: true,
  });
  const principal = (await resolveSession(session.token)) as Principal;
  return { userId, session, principal };
}

describeIntegration('platform services (integration)', () => {
  beforeAll(async () => {
    await assertSeeded();
    process.env.SESSION_SECRET ??= randomBytes(48).toString('base64');
    storageDir = mkdtempSync(join(tmpdir(), 'toothlogy-storage-'));
    process.env.STORAGE_PROVIDER = 'local';
    process.env.STORAGE_LOCAL_DIR = storageDir;
  });

  beforeEach(async () => {
    await resetDatabase();
    useDatabaseAuditSink();
    storageProvider.set(null); // re-read the directory for this suite
  });

  afterAll(async () => {
    storageProvider.set(null);
    rmSync(storageDir, { recursive: true, force: true });
    await disconnectTestDb();
  });

  // -------------------------------------------------------------------------
  // Files
  // -------------------------------------------------------------------------

  it('stores a valid upload, records scanning honestly, and serves it only via a signed URL', async () => {
    const { principal } = await userWithPrincipal('asha@example.test');

    const uploaded = await uploadFile({
      principal,
      purpose: 'XRAY',
      filename: 'molar.png',
      declaredType: 'image/png',
      bytes: PNG,
    });
    expect(uploaded).toMatchObject({ sensitivity: 'phi', status: 'ACTIVE', scanStatus: 'SCANNER_NOT_CONFIGURED' });

    const signed = await createDownloadUrl(principal, uploaded.id);
    // PHI links live for 60 seconds at most.
    expect(signed.expiresAt.getTime() - Date.now()).toBeLessThanOrEqual(61_000);

    const response = await fileContent(new Request(`http://localhost${signed.url}`));
    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('image/png');
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
    expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(PNG);

    // A tampered signature is indistinguishable from a missing file.
    const tampered = await fileContent(new Request(`http://localhost${signed.url.replace(/s=[^&]+/, 's=AAAA')}`));
    expect(tampered.status).toBe(404);

    const log = await testDb().fileAccessLog.findMany({ where: { fileId: uploaded.id }, orderBy: { occurredAt: 'asc' } });
    expect(log.map((l) => l.action)).toEqual(['UPLOAD', 'SIGN_URL', 'DOWNLOAD']);
  });

  it('refuses a disguised file, a wrong extension and an oversize file', async () => {
    const { principal } = await userWithPrincipal('asha@example.test');
    const html = new TextEncoder().encode('<!doctype html><script>alert(1)</script>');

    await expect(
      uploadFile({ principal, purpose: 'AVATAR', filename: 'me.png', declaredType: 'image/png', bytes: html }),
    ).rejects.toThrow(/not accepted/);
    await expect(
      uploadFile({ principal, purpose: 'AVATAR', filename: 'me.pdf', declaredType: 'image/png', bytes: PNG }),
    ).rejects.toThrow(/extension/);
    await expect(
      uploadFile({ principal, purpose: 'INVOICE', filename: 'x.png', declaredType: 'image/png', bytes: PNG }),
    ).rejects.toThrow(/not accepted/);

    const big = new Uint8Array(6 * 1024 * 1024);
    big.set(PNG);
    await expect(
      uploadFile({ principal, purpose: 'AVATAR', filename: 'big.png', declaredType: 'image/png', bytes: big }),
    ).rejects.toThrow(/too large/);
  });

  it('does not let another user sign, read or delete a private file', async () => {
    const owner = await userWithPrincipal('owner@example.test');
    const stranger = await userWithPrincipal('stranger@example.test');

    const file = await uploadFile({
      principal: owner.principal,
      purpose: 'PRESCRIPTION',
      filename: 'rx.pdf',
      declaredType: 'application/pdf',
      bytes: PDF,
    });

    await expect(createDownloadUrl(stranger.principal, file.id)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(deleteFile(stranger.principal, file.id)).rejects.toMatchObject({ code: 'NOT_FOUND' });

    const denied = await testDb().fileAccessLog.count({ where: { fileId: file.id, outcome: 'DENIED' } });
    expect(denied).toBe(2);
  });

  it('serves public files without a signature and private files never', async () => {
    const { principal } = await userWithPrincipal('asha@example.test');
    const avatar = await uploadFile({ principal, purpose: 'AVATAR', filename: 'me.png', declaredType: 'image/png', bytes: PNG });
    const rx = await uploadFile({ principal, purpose: 'PRESCRIPTION', filename: 'rx.pdf', declaredType: 'application/pdf', bytes: PDF });

    const ok = await publicFile(new Request(`http://localhost/api/v1/files/${avatar.id}/public`), { params: { id: avatar.id } });
    expect(ok.status).toBe(200);
    const refused = await publicFile(new Request(`http://localhost/api/v1/files/${rx.id}/public`), { params: { id: rx.id } });
    expect(refused.status).toBe(404);
  });

  it('keeps a deleted prescription for its retention period and purges an avatar at once', async () => {
    const { principal } = await userWithPrincipal('asha@example.test');
    const avatar = await uploadFile({ principal, purpose: 'AVATAR', filename: 'me.png', declaredType: 'image/png', bytes: PNG });
    const rx = await uploadFile({ principal, purpose: 'PRESCRIPTION', filename: 'rx.pdf', declaredType: 'application/pdf', bytes: PDF });

    await deleteFile(principal, avatar.id);
    const { retainUntil } = await deleteFile(principal, rx.id);
    expect(retainUntil.getTime()).toBeGreaterThan(Date.now() + 2 * 365 * 24 * 3600 * 1000);

    const result = await purgeDeletedFiles();
    expect(result.purged).toBe(1);
    expect((await testDb().fileObject.findUniqueOrThrow({ where: { id: avatar.id } })).status).toBe('PURGED');
    expect((await testDb().fileObject.findUniqueOrThrow({ where: { id: rx.id } })).status).toBe('DELETED');
  });

  it('only accepts the caller’s own avatar upload as a profile photo', async () => {
    const a = await userWithPrincipal('a@example.test');
    const b = await userWithPrincipal('b@example.test');
    const bAvatar = await uploadFile({ principal: b.principal, purpose: 'AVATAR', filename: 'b.png', declaredType: 'image/png', bytes: PNG });

    await expect(updateProfile(a.userId, { avatarFileId: bAvatar.id })).rejects.toThrow(/Upload the photo first/);
    const own = await uploadFile({ principal: a.principal, purpose: 'AVATAR', filename: 'a.png', declaredType: 'image/png', bytes: PNG });
    expect((await updateProfile(a.userId, { avatarFileId: own.id })).avatarFileId).toBe(own.id);
  });

  // -------------------------------------------------------------------------
  // Search
  // -------------------------------------------------------------------------

  it('finds documents by synonym, tolerates a typo, filters facets and ranks by distance', async () => {
    await indexDocuments([
      {
        id: 'd1',
        type: 'dentist',
        fields: {
          title: 'Dr Meera Rao, Endodontist',
          summary: 'Root canal treatment and retreatment',
          body: 'endodontics root canal treatment',
          facets: { specialty: ['endodontics'], language: ['en', 'hi'], fee: 50000 },
          countryCode: 'IN',
        },
        location: { latitude: 21.2514, longitude: 81.6296 }, // Raipur
        qualityScore: 0.8,
      },
      {
        id: 'd2',
        type: 'dentist',
        fields: {
          title: 'Dr Arjun Nair, Orthodontist',
          summary: 'Braces and clear aligners',
          body: 'orthodontics braces aligners',
          facets: { specialty: ['orthodontics'], language: ['en', 'ml'], fee: 80000 },
          countryCode: 'IN',
        },
        location: { latitude: 21.1938, longitude: 81.3509 }, // Bhilai
        qualityScore: 0.6,
      },
      {
        id: 'd3',
        type: 'dentist',
        fields: { title: 'Dr Unpublished', body: 'root canal', isPublished: false, facets: {} },
      },
    ]);

    // "rct" is a synonym for root canal treatment.
    const rct = await runSearch({ type: 'dentist', q: 'rct', limit: 10 });
    expect(rct.hits.map((h) => h.id)).toEqual(['d1']);
    expect(rct.hits[0]!.promoted).toBe(false);

    // A misspelling still finds the orthodontist.
    const typo = await runSearch({ type: 'dentist', q: 'ortodontist', limit: 10 });
    expect(typo.hits.map((h) => h.id)).toContain('d2');

    // Facet filters, and unpublished documents never appear.
    const hindi = await runSearch({ type: 'dentist', filters: [{ field: 'language', operator: 'eq', value: 'hi' }], limit: 10 });
    expect(hindi.hits.map((h) => h.id)).toEqual(['d1']);
    const cheap = await runSearch({ type: 'dentist', filters: [{ field: 'fee', operator: 'lte', value: 60000 }], limit: 10 });
    expect(cheap.hits.map((h) => h.id)).toEqual(['d1']);

    // Distance from Bhilai: d2 first, d1 ~30 km away, both inside 50 km.
    const near = await runSearch({
      type: 'dentist',
      geo: { centre: { latitude: 21.1938, longitude: 81.3509 }, radiusMetres: 50_000 },
      sort: 'distance',
      facets: ['specialty'],
      limit: 10,
    });
    expect(near.hits.map((h) => h.id)).toEqual(['d2', 'd1']);
    expect(near.hits[1]!.distanceMetres).toBeGreaterThan(25_000);
    expect(near.total).toBe(2);
    expect(near.facets.specialty).toEqual(
      expect.arrayContaining([
        { value: 'endodontics', count: 1 },
        { value: 'orthodontics', count: 1 },
      ]),
    );

    // A 10 km radius around Bhilai excludes Raipur.
    const tight = await runSearch({
      type: 'dentist',
      geo: { centre: { latitude: 21.1938, longitude: 81.3509 }, radiusMetres: 10_000 },
      limit: 10,
    });
    expect(tight.hits.map((h) => h.id)).toEqual(['d2']);
  });

  // -------------------------------------------------------------------------
  // Geography
  // -------------------------------------------------------------------------

  it('geocodes to a city centre and says so', async () => {
    const results = await geocode('Raipur', 'IN');
    expect(results[0]).toMatchObject({ precision: 'city', source: 'reference' });
    expect(results[0]!.formattedAddress).toContain('(city centre)');
    expect(results[0]!.confidence).toBeLessThanOrEqual(0.5);

    const reverse = await reverseGeocode({ latitude: 21.25, longitude: 81.63 });
    expect(reverse?.address.locality).toBe('Raipur');
    expect(await reverseGeocode({ latitude: 0, longitude: 0 })).toBeNull();
  });

  // -------------------------------------------------------------------------
  // Preferences
  // -------------------------------------------------------------------------

  it('saves validated preferences and refuses ones the platform cannot honour', async () => {
    const { userId } = await userWithPrincipal('asha@example.test');

    const saved = await updatePreferences(userId, {
      timezone: 'Asia/Dubai',
      theme: 'DARK',
      textScale: 120,
      quietHours: { start: 22 * 60, end: 7 * 60 },
    });
    expect(saved).toMatchObject({ timezone: 'Asia/Dubai', theme: 'DARK', textScale: 120, quietHours: { start: 1320, end: 420 } });
    expect((await getPreferences(userId)).theme).toBe('DARK');

    await expect(updatePreferences(userId, { timezone: 'Mars/Olympus' })).rejects.toThrow(/not valid/);
    await expect(updatePreferences(userId, { textScale: 400 })).rejects.toThrow(/not valid/);
  });

  it('reports transactional categories as locked and honours signed unsubscribe links', async () => {
    const { userId } = await userWithPrincipal('asha@example.test');
    const matrix = await getNotificationPreferences(userId);
    expect(matrix.find((c) => c.category === 'security')!.channels.every((ch) => ch.locked)).toBe(true);

    const link = unsubscribeLink(userId, 'marketing', 'email');
    const params = Object.fromEntries(new URL(`http://x${link}`).searchParams) as { u: string; c: string; ch: string; s: string };
    await unsubscribeFromLink(params);
    const pref = await testDb().notificationPreference.findFirstOrThrow({ where: { userId, category: 'MARKETING', channel: 'EMAIL' } });
    expect(pref.enabled).toBe(false);

    await expect(unsubscribeFromLink({ ...params, c: 'security' })).rejects.toThrow(/not valid/);
  });

  it('records consent append-only', async () => {
    const { userId } = await userWithPrincipal('asha@example.test');
    await setConsent(userId, 'MARKETING_EMAIL', true);
    await setConsent(userId, 'MARKETING_EMAIL', false);
    await setConsent(userId, 'MARKETING_EMAIL', true);

    expect((await listConsents(userId)).find((c) => c.purpose === 'MARKETING_EMAIL')!.granted).toBe(true);
    // Three decisions, two rows: the first grant was revoked, not deleted.
    const rows = await testDb().consent.findMany({ where: { userId, purpose: 'MARKETING_EMAIL' } });
    expect(rows).toHaveLength(2);
    expect(rows.filter((r) => r.revokedAt !== null)).toHaveLength(1);
  });

  // -------------------------------------------------------------------------
  // Organization management
  // -------------------------------------------------------------------------

  it('protects the owner, transfers ownership only from the owner, and names what verification needs', async () => {
    const owner = await userWithPrincipal('owner@example.test');
    const admin = await userWithPrincipal('admin@example.test');

    const { organizationId } = await createOrganization(
      { name: 'Bright Smile', slug: 'bright-smile', type: 'CLINIC', countryCode: 'IN', timezone: 'Asia/Kolkata' },
      owner.userId,
    );
    const invite = await inviteToOrganization(organizationId, { email: 'admin@example.test', roleKey: 'clinic_admin' }, owner.userId);
    await acceptInvitation(invite.token, admin.userId);

    // Another administrator cannot demote or remove the owner…
    await expect(setMemberRole(organizationId, owner.userId, 'clinic_staff', admin.userId)).rejects.toThrow(/owner/);
    await expect(removeOrganizationMember(organizationId, owner.userId, admin.userId)).rejects.toThrow(/owner/);
    // …nor take ownership.
    await expect(transferOwnership(organizationId, admin.userId, admin.userId)).rejects.toMatchObject({ code: 'FORBIDDEN' });

    // Verification names everything that is missing.
    await expect(
      submitOrganizationVerification(organizationId, owner.userId, { documentFileIds: ['fil_nope'] }),
    ).rejects.toThrow(/registration number.*location/s);

    // Complete it: registration number, a located branch, an org-owned document.
    await updateOrganizationProfile(organizationId, { registrationNumber: 'CG-DENT-2021-0042' }, owner.userId);
    await createLocation(
      organizationId,
      {
        name: 'Main',
        slug: 'main',
        timezone: 'Asia/Kolkata',
        isPrimary: true,
        latitude: 21.2514,
        longitude: 81.6296,
        address: { lines: ['12 MG Road'], locality: 'Raipur', postalCode: '492001', countryCode: 'IN' },
      },
      owner.userId,
    );
    // Re-resolve: the owner's principal now includes the new organization.
    const refreshed = (await resolveSession(owner.session.token)) as Principal;
    const cert = await uploadFile({
      principal: refreshed,
      purpose: 'CERTIFICATE',
      filename: 'registration.pdf',
      declaredType: 'application/pdf',
      bytes: PDF,
      organizationId,
    });
    const submitted = await submitOrganizationVerification(organizationId, owner.userId, { documentFileIds: [cert.id] });
    expect(submitted.verificationRequestId).toMatch(/^ver_/);

    // Ownership moves when the owner gives it.
    await transferOwnership(organizationId, owner.userId, admin.userId);
    const org = await testDb().organization.findUniqueOrThrow({ where: { id: organizationId } });
    expect(org.ownerUserId).toBe(admin.userId);

    // Changing verified registration details un-verifies.
    await testDb().organization.update({ where: { id: organizationId }, data: { verifiedAt: new Date(), status: 'ACTIVE' } });
    const changed = await updateOrganizationProfile(organizationId, { registrationNumber: 'CG-DENT-2021-9999' }, admin.userId);
    expect(changed.verificationCleared).toBe(true);
    expect(changed.organization.status).toBe('PENDING');
  });

  it('uses the session cookie name the routes read', () => {
    expect(SESSION_COOKIE).toBe('tl_session');
  });
});

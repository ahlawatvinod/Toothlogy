/**
 * TL-TEST-GLOBALIZATION-001 — opening a market is configuration.
 *
 * Staff see every modelled country with its readiness; a country missing
 * anything cannot be opened; closing one stops new organizations there (the
 * database switch, not the registry seed) and opening it again lets them in;
 * each switch needs a reason and is audited. Enterprise sign-in answers
 * NOT_CONFIGURED while no provider is connected.
 */

import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';
import { register } from '@/platform/auth/service';
import { createOrganization } from '@/platform/organizations/service';
import { listCountries, setCountryEnabled } from '@/platform/globalization/countries';
import { ssoProvider } from '@/platform/auth/sso-ports';
import type { AuthenticatedPrincipal } from '@/platform/rbac';
import { assertSeeded, describeIntegration, disconnectTestDb, resetDatabase, testDb, useDatabaseAuditSink } from '../helpers/database';

const PASSWORD = 'a sufficiently long passphrase';
const principal = (userId: string, roles: string[]): AuthenticatedPrincipal => ({ kind: 'user', userId, roles, organizations: [], sessionId: 'test-session' });
const code = (promise: Promise<unknown>) => promise.then(() => 'OK', (error: { code?: string }) => error.code ?? String(error));

describeIntegration('Countries and enterprise sign-in', () => {
  beforeAll(async () => {
    await assertSeeded();
  });
  beforeEach(async () => {
    await resetDatabase();
    useDatabaseAuditSink();
  });
  afterAll(async () => {
    // Reference data is shared by every test: leave India open whatever happened.
    await testDb().country.update({ where: { code: 'IN' }, data: { enabled: true } });
    await disconnectTestDb();
  });

  it('opens only ready countries, and the switch decides where organizations may be created', async () => {
    const staff = principal((await register({ email: 'ops@example.test', password: PASSWORD, displayName: 'Ops', role: 'patient', acceptedTerms: true })).userId, ['platform_admin']);
    const ownerId = (await register({ email: 'owner@example.test', password: PASSWORD, displayName: 'Owner', role: 'dentist', acceptedTerms: true })).userId;
    expect(await code(listCountries(principal(ownerId, ['dentist'])))).toBe('FORBIDDEN');

    const countries = await listCountries(staff);
    const india = countries.find((c) => c.code === 'IN')!;
    expect(india).toMatchObject({ enabled: true, ready: true });
    expect(india.checks.map((c) => c.key)).toEqual(['currency', 'language', 'timezone', 'regions', 'pricing', 'tax']);
    expect(india.checks.find((c) => c.key === 'tax')).toMatchObject({ ok: true, detail: expect.stringMatching(/^GST: tax invoice, GSTIN, HSN\/SAC codes; fiscal year \d{4}-\d{2}$/) });
    const closed = countries.find((c) => !c.enabled && !c.ready)!;
    expect(closed).toBeDefined();
    expect(await code(setCountryEnabled(staff, closed.code, { enabled: true, reason: 'Trying to open early.' }))).toBe('PRECONDITION_FAILED');

    expect(await code(setCountryEnabled(staff, 'IN', { enabled: false, reason: 'no' }))).toBe('VALIDATION_FAILED');
    await setCountryEnabled(staff, 'IN', { enabled: false, reason: 'Pausing onboarding for a test.' });
    expect(await code(createOrganization({ name: 'Closed clinic', slug: 'closed-clinic', type: 'CLINIC', countryCode: 'IN', timezone: 'Asia/Kolkata' }, ownerId))).toBe('VALIDATION_FAILED');
    expect(await code(setCountryEnabled(staff, 'IN', { enabled: false, reason: 'Pausing onboarding again.' }))).toBe('CONFLICT');
    await setCountryEnabled(staff, 'IN', { enabled: true, reason: 'Reopening after the test.' });
    expect((await createOrganization({ name: 'Open clinic', slug: 'open-clinic', type: 'CLINIC', countryCode: 'IN', timezone: 'Asia/Kolkata' }, ownerId)).organizationId).toBeTruthy();

    const trail = await testDb().auditEvent.findMany({ where: { subject: 'country:IN' }, orderBy: { occurredAt: 'asc' } });
    expect(trail.map((e) => e.action)).toEqual(['COUNTRY_CLOSED', 'COUNTRY_OPENED']);
    expect(trail[0]!.detail).toMatchObject({ reason: 'Pausing onboarding for a test.' });
  });

  it('answers NOT_CONFIGURED for enterprise sign-in while no provider is connected', async () => {
    expect(ssoProvider.isConfigured()).toBe(false);
    expect(await code(ssoProvider.get().authorizationUrl({ organizationId: 'org_x', returnTo: '/account', state: 's' }))).toBe('NOT_CONFIGURED');
  });
});

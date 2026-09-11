/**
 * TL-TEST-IOT-001 — connected equipment.
 *
 * Registration returns a token once (only its fingerprint is kept); telemetry
 * is refused without a valid, active token; the first reading connects the
 * device (DEVICE_CONNECTED in the outbox); limits are validated; a reading out
 * of range — or a fault — opens one alert per device and reading and tells the
 * administrators; a normal reading does not clear it; a person resolves it;
 * re-keying and retiring cut the old token off; staff see but do not change;
 * another practice sees nothing.
 */

import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';
import { register } from '@/platform/auth/service';
import { createOrganization } from '@/platform/organizations/service';
import { deviceDetail, ingestTelemetry, listDevices, registerDevice, resolveAlert, retireDevice, rotateDeviceToken, setLimits } from '@/platform/devices/service';
import type { AuthenticatedPrincipal } from '@/platform/rbac';
import { assertSeeded, describeIntegration, disconnectTestDb, resetDatabase, testDb, useDatabaseAuditSink } from '../helpers/database';

const PASSWORD = 'a sufficiently long passphrase';
const DAY = 86_400_000;

function principal(userId: string, roles: string[], organizations: AuthenticatedPrincipal['organizations'] = []): AuthenticatedPrincipal {
  return { kind: 'user', userId, roles, organizations, sessionId: 'test-session' };
}
let seq = 0;
async function user(label: string) {
  seq += 1;
  return (await register({ email: `${label}-${seq}@example.test`, password: PASSWORD, displayName: `${label} ${seq}`, role: 'patient', acceptedTerms: true })).userId;
}
async function practice(slug: string) {
  const ownerId = await user(`owner-${slug}`);
  const { organizationId } = await createOrganization({ name: `Clinic ${slug}`, slug, type: 'CLINIC', countryCode: 'IN', timezone: 'Asia/Kolkata' }, ownerId);
  const staffId = await user(`staff-${slug}`);
  await testDb().organizationMember.create({ data: { id: `om_${Math.random().toString(36).slice(2)}`, userId: staffId, organizationId, roleKey: 'clinic_staff' } });
  return {
    organizationId,
    admin: principal(ownerId, ['patient'], [{ organizationId, roles: ['clinic_admin'] }]),
    staff: principal(staffId, ['patient'], [{ organizationId, roles: ['clinic_staff'] }]),
  };
}
const send = (token: string, readings: Array<{ metric: string; value: number; at?: string }>) => ingestTelemetry(`Device ${token}`, { readings });
const code = (promise: Promise<unknown>) => promise.then(() => 'OK', (error: { code?: string }) => error.code ?? String(error));

describeIntegration('Connected equipment', () => {
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

  it('registers with a one-time token, connects on the first reading, and alerts once per reading out of range', async () => {
    const p = await practice('iot-a');
    const other = await practice('iot-b');
    expect(await code(registerDevice(p.staff, p.organizationId, { kind: 'AUTOCLAVE', name: 'Autoclave 1' }))).toBe('FORBIDDEN');
    expect(await code(registerDevice(other.admin, p.organizationId, { kind: 'AUTOCLAVE', name: 'Autoclave 1' }))).toBe('NOT_FOUND');
    const { deviceId, token } = await registerDevice(p.admin, p.organizationId, { kind: 'AUTOCLAVE', name: 'Autoclave 1', serialNumber: 'AC-778' });
    expect(token).toMatch(/^tld_[A-Za-z0-9_-]{43}$/);
    const row = await testDb().device.findUniqueOrThrow({ where: { id: deviceId } });
    expect(row.tokenHash).not.toContain(token);
    expect(row.tokenHint).toBe(token.slice(-4));

    expect(await code(ingestTelemetry(null, { readings: [{ metric: 'temperature_c', value: 134 }] }))).toBe('UNAUTHENTICATED');
    expect(await code(ingestTelemetry(`Bearer ${token}`, { readings: [{ metric: 'temperature_c', value: 134 }] }))).toBe('UNAUTHENTICATED');
    expect(await code(send(`tld_${'A'.repeat(43)}`, [{ metric: 'temperature_c', value: 134 }]))).toBe('UNAUTHENTICATED');
    expect(await code(send(token, [{ metric: 'Temp C', value: 1 }]))).toBe('VALIDATION_FAILED');
    expect(await code(send(token, Array.from({ length: 101 }, () => ({ metric: 'temperature_c', value: 1 }))))).toBe('VALIDATION_FAILED');
    expect(await code(send(token, [{ metric: 'temperature_c', value: 1, at: new Date(Date.now() - 8 * DAY).toISOString() }]))).toBe('VALIDATION_FAILED');

    expect(await send(token, [{ metric: 'temperature_c', value: 134 }])).toEqual({ accepted: 1, alertsOpened: 0 });
    expect((await testDb().device.findUniqueOrThrow({ where: { id: deviceId } })).connectedAt).not.toBeNull();
    expect(await testDb().outboxEvent.count({ where: { name: 'DEVICE_CONNECTED' } })).toBe(1);
    await send(token, [{ metric: 'temperature_c', value: 135 }]);
    expect(await testDb().outboxEvent.count({ where: { name: 'DEVICE_CONNECTED' } })).toBe(1);

    expect(await code(setLimits(p.admin, deviceId, { limits: [{ metric: 'temperature_c', min: 140, max: 121 }] }))).toBe('VALIDATION_FAILED');
    expect(await code(setLimits(p.admin, deviceId, { limits: [{ metric: 'temperature_c', min: 121 }, { metric: 'temperature_c', max: 138 }] }))).toBe('VALIDATION_FAILED');
    expect(await code(setLimits(p.admin, deviceId, { limits: [{ metric: 'pressure_bar' }] }))).toBe('VALIDATION_FAILED');
    expect(await code(setLimits(p.staff, deviceId, { limits: [{ metric: 'temperature_c', min: 121 }] }))).toBe('FORBIDDEN');
    await setLimits(p.admin, deviceId, { limits: [{ metric: 'temperature_c', min: 121, max: 138 }, { metric: 'pressure_bar', max: 2.4 }] });

    expect(await send(token, [{ metric: 'temperature_c', value: 110 }, { metric: 'temperature_c', value: 108 }])).toEqual({ accepted: 2, alertsOpened: 1 });
    expect(await send(token, [{ metric: 'temperature_c', value: 105 }])).toEqual({ accepted: 1, alertsOpened: 0 });
    expect(await send(token, [{ metric: 'temperature_c', value: 130 }, { metric: 'fault', value: 3 }, { metric: 'pressure_bar', value: 2 }])).toEqual({ accepted: 3, alertsOpened: 1 });
    const told = await testDb().inAppNotification.findMany({ where: { userId: p.admin.userId, notificationId: 'TL-NOTIF-DEVICE-ALERT-001' } });
    expect(told.map((n) => n.body).sort()).toEqual(['Autoclave 1: reported fault code 3', 'Autoclave 1: temperature_c 110 is below the lowest allowed (121)']);

    // A normal reading did not clear the temperature alert; a person does.
    const detail = await deviceDetail(p.staff, deviceId);
    const open = detail.device.alerts.filter((a) => !a.resolvedAt);
    expect(open.map((a) => a.metric).sort()).toEqual(['fault', 'temperature_c']);
    expect(JSON.stringify(detail)).not.toContain(row.tokenHash);
    expect(detail.latest.find((l) => l.metric === 'temperature_c')!.value).toBe(130);
    expect(detail.canManage).toBe(false);
    const temperatureAlert = open.find((a) => a.metric === 'temperature_c')!;
    expect(await code(resolveAlert(p.staff, temperatureAlert.id, {}))).toBe('FORBIDDEN');
    await resolveAlert(p.admin, temperatureAlert.id, { note: 'Door seal replaced; cycle re-run.' });
    expect(await code(resolveAlert(p.admin, temperatureAlert.id, {}))).toBe('CONFLICT');
    expect(await send(token, [{ metric: 'temperature_c', value: 115 }])).toEqual({ accepted: 1, alertsOpened: 1 });

    expect(await code(deviceDetail(other.admin, deviceId))).toBe('NOT_FOUND');
    expect((await listDevices(p.staff, p.organizationId)).devices[0]).toMatchObject({ id: deviceId, openAlerts: 2 });
  });

  it('cuts the old token off on re-keying and every token off on retirement', async () => {
    const p = await practice('iot-c');
    const { deviceId, token } = await registerDevice(p.admin, p.organizationId, { kind: 'REFRIGERATOR', name: 'Vaccine fridge' });
    const { token: fresh } = await rotateDeviceToken(p.admin, deviceId);
    expect(fresh).not.toBe(token);
    expect(await code(send(token, [{ metric: 'temperature_c', value: 5 }]))).toBe('UNAUTHENTICATED');
    expect(await send(fresh, [{ metric: 'temperature_c', value: 5 }])).toEqual({ accepted: 1, alertsOpened: 0 });
    await retireDevice(p.admin, deviceId);
    expect(await code(retireDevice(p.admin, deviceId))).toBe('CONFLICT');
    expect(await code(send(fresh, [{ metric: 'temperature_c', value: 5 }]))).toBe('UNAUTHENTICATED');
    expect(await code(rotateDeviceToken(p.admin, deviceId))).toBe('PRECONDITION_FAILED');
    expect(await testDb().deviceReading.count({ where: { deviceId } })).toBe(1); // history stays
  });
});

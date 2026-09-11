/**
 * TOOTHLOGY CONNECTED EQUIPMENT
 *
 * - A practice registers a device and receives its token once. Toothlogy keeps
 *   a SHA-256 fingerprint (as for every bearer token) and the last four
 *   characters to tell tokens apart. Re-keying replaces it at once.
 * - The device reports over HTTPS with `Authorization: Device <token>`.
 *   Malformed, unknown and retired tokens are refused before anything is
 *   stored.
 * - The first reading marks the device connected, emitting DEVICE_CONNECTED
 *   through the outbox in the same transaction.
 * - The practice sets an acceptable range per reading. A reading outside it —
 *   or a `fault` reading above zero — opens one alert per device and reading
 *   (unique open key, taken with ON CONFLICT DO NOTHING so two simultaneous
 *   reports cannot open two) and tells the practice's administrators after the
 *   commit. Alerts are resolved by a person, never cleared by a later normal
 *   reading: a passing reading does not undo a failed sterilisation cycle.
 * - Front-desk staff see equipment; administrators change it. Retired, never
 *   deleted: the history stays.
 */

import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { errors } from '../kernel/errors';
import { newId } from '../kernel/ids';
import { db, transaction } from '../db/client';
import { recordAuditEvent } from '../audit';
import { notifyOrganizationAdmins } from '../notifications';
import { can, isAuthenticated, type AuthenticatedPrincipal, type Principal } from '../rbac';
import { hashToken } from '../auth/tokens';
import { emitInTransaction } from '../events/outbox';
import { FAULT_METRIC, METRIC_PATTERN } from './labels';

export const READ = 'tl.iot.device.read';
export const MANAGE = 'tl.iot.device.manage';
const DAY = 86_400_000;
const MAX_READINGS = 100;
const ACTIVE_DEVICES_PER_ORGANIZATION = 200;
const TOKEN = /^tld_[A-Za-z0-9_-]{43}$/;
const KINDS = ['AUTOCLAVE', 'DENTAL_CHAIR', 'COMPRESSOR', 'SUCTION', 'XRAY_UNIT', 'WATERLINE', 'REFRIGERATOR', 'OTHER'] as const;

function signedIn(principal: Principal): AuthenticatedPrincipal {
  if (!isAuthenticated(principal)) throw errors.unauthenticated();
  return principal;
}

/** Validate as the routes do: a bad input is VALIDATION_FAILED naming the field. */
function parse<T>(schema: z.ZodType<T>, raw: unknown): T {
  const result = schema.safeParse(raw);
  if (result.success) return result.data;
  const issue = result.error.issues[0]!;
  throw errors.validation(issue.message, issue.path.length ? { field: issue.path.map(String).join('.') } : undefined);
}

/** 32 random bytes; the prefix lets secret scanners recognise a leaked one. */
function newDeviceToken(): string {
  return `tld_${randomBytes(32).toString('base64url')}`;
}

const metric = z.string().regex(METRIC_PATTERN, 'Name readings in lower case with underscores, unit last — e.g. temperature_c.');

// ---------------------------------------------------------------------------
// The practice
// ---------------------------------------------------------------------------

function mayChange(me: AuthenticatedPrincipal, organizationId: string) {
  if (!can(me, READ, { organizationId })) throw errors.notFound('Organization');
  if (!can(me, MANAGE, { organizationId })) throw errors.forbidden(MANAGE);
}

export async function listDevices(principal: Principal, organizationId: string) {
  const me = signedIn(principal);
  if (!can(me, READ, { organizationId })) throw errors.notFound('Organization');
  const [organization, devices, alerts] = await Promise.all([
    db().organization.findFirst({ where: { id: organizationId, deletedAt: null }, select: { id: true, name: true } }),
    db().device.findMany({ where: { organizationId }, orderBy: [{ status: 'asc' }, { name: 'asc' }], select: { id: true, kind: true, name: true, status: true, lastSeenAt: true, connectedAt: true } }),
    db().deviceAlert.groupBy({ by: ['deviceId'], where: { resolvedAt: null, device: { organizationId } }, _count: { _all: true } }),
  ]);
  if (!organization) throw errors.notFound('Organization');
  const open = new Map(alerts.map((a) => [a.deviceId, a._count._all]));
  return { organization, devices: devices.map((d) => ({ ...d, openAlerts: open.get(d.id) ?? 0 })), canManage: can(me, MANAGE, { organizationId }) };
}

export const registerSchema = z.object({
  kind: z.enum(KINDS),
  name: z.string().trim().min(2, 'Name the device.').max(80),
  serialNumber: z.string().trim().max(80).optional(),
});

/** Register a device. The token is returned here and never again. */
export async function registerDevice(principal: Principal, organizationId: string, raw: z.input<typeof registerSchema>, context: { requestId?: string } = {}) {
  const me = signedIn(principal);
  mayChange(me, organizationId);
  const input = parse(registerSchema, raw);
  if (!(await db().organization.findFirst({ where: { id: organizationId, deletedAt: null }, select: { id: true } }))) throw errors.notFound('Organization');
  if ((await db().device.count({ where: { organizationId, status: 'ACTIVE' } })) >= ACTIVE_DEVICES_PER_ORGANIZATION) {
    throw errors.preconditionFailed(`A practice can have ${ACTIVE_DEVICES_PER_ORGANIZATION} active devices. Retire one first.`);
  }
  const token = newDeviceToken();
  const id = newId('device');
  await db().device.create({ data: { id, organizationId, kind: input.kind, name: input.name, serialNumber: input.serialNumber || null, tokenHash: hashToken(token), tokenHint: token.slice(-4), createdByUserId: me.userId } });
  await recordAuditEvent({ action: 'DEVICE_REGISTERED', actor: me.userId, subject: id, organizationId, outcome: 'success', requestId: context.requestId, detail: { kind: input.kind } });
  return { deviceId: id, token };
}

async function deviceFor(me: AuthenticatedPrincipal, deviceId: string, need: 'read' | 'manage') {
  const device = await db().device.findUnique({ where: { id: deviceId }, select: { id: true, organizationId: true, status: true, name: true } });
  if (!device || !can(me, READ, { organizationId: device.organizationId })) throw errors.notFound('Device');
  if (need === 'manage' && !can(me, MANAGE, { organizationId: device.organizationId })) throw errors.forbidden(MANAGE);
  return device;
}

/** A device for its practice: never the token's fingerprint. */
export async function deviceDetail(principal: Principal, deviceId: string) {
  const me = signedIn(principal);
  const { organizationId } = await deviceFor(me, deviceId, 'read');
  const [device, recent, latest] = await Promise.all([
    db().device.findUniqueOrThrow({
      where: { id: deviceId },
      select: {
        id: true,
        organizationId: true,
        kind: true,
        name: true,
        serialNumber: true,
        tokenHint: true,
        status: true,
        connectedAt: true,
        lastSeenAt: true,
        createdAt: true,
        limits: { orderBy: { metric: 'asc' }, select: { metric: true, min: true, max: true } },
        alerts: { orderBy: { openedAt: 'desc' }, take: 50, select: { id: true, metric: true, value: true, message: true, openedAt: true, resolvedAt: true, resolutionNote: true } },
      },
    }),
    db().deviceReading.findMany({ where: { deviceId }, orderBy: { recordedAt: 'desc' }, take: 30, select: { id: true, metric: true, value: true, recordedAt: true } }),
    db().$queryRaw<Array<{ metric: string; value: number; recordedAt: Date }>>(
      Prisma.sql`SELECT DISTINCT ON ("metric") "metric", "value", "recordedAt" FROM "device_readings" WHERE "deviceId" = ${deviceId} ORDER BY "metric", "recordedAt" DESC`,
    ),
  ]);
  return { device, latest, recent, canManage: can(me, MANAGE, { organizationId }) };
}

export const limitsSchema = z.object({
  limits: z
    .array(z.object({ metric, min: z.number().finite().optional(), max: z.number().finite().optional() }))
    .max(20, 'At most 20 limits per device.'),
});

/** Replace the device's acceptable ranges. */
export async function setLimits(principal: Principal, deviceId: string, raw: z.input<typeof limitsSchema>, context: { requestId?: string } = {}) {
  const me = signedIn(principal);
  const device = await deviceFor(me, deviceId, 'manage');
  const { limits } = parse(limitsSchema, raw);
  const seen = new Set<string>();
  for (const l of limits) {
    if (seen.has(l.metric)) throw errors.validation(`“${l.metric}” is listed twice.`, { field: 'limits' });
    seen.add(l.metric);
    if (l.min === undefined && l.max === undefined) throw errors.validation(`Give “${l.metric}” a lowest or highest value.`, { field: 'limits' });
    if (l.min !== undefined && l.max !== undefined && l.min > l.max) throw errors.validation(`For “${l.metric}” the lowest value is above the highest.`, { field: 'limits' });
  }
  await transaction(async (tx) => {
    await tx.deviceLimit.deleteMany({ where: { deviceId: device.id } });
    if (limits.length) await tx.deviceLimit.createMany({ data: limits.map((l) => ({ id: newId('device'), deviceId: device.id, metric: l.metric, min: l.min ?? null, max: l.max ?? null })) });
  });
  await recordAuditEvent({ action: 'DEVICE_LIMITS_SET', actor: me.userId, subject: device.id, organizationId: device.organizationId, outcome: 'success', requestId: context.requestId, detail: { count: limits.length } });
  return { limits: limits.length };
}

/** A new token, returned once; the old one stops working at once. */
export async function rotateDeviceToken(principal: Principal, deviceId: string, context: { requestId?: string } = {}) {
  const me = signedIn(principal);
  const device = await deviceFor(me, deviceId, 'manage');
  if (device.status !== 'ACTIVE') throw errors.preconditionFailed('This device is retired.');
  const token = newDeviceToken();
  await db().device.update({ where: { id: device.id }, data: { tokenHash: hashToken(token), tokenHint: token.slice(-4) } });
  await recordAuditEvent({ action: 'DEVICE_REKEYED', actor: me.userId, subject: device.id, organizationId: device.organizationId, outcome: 'success', requestId: context.requestId });
  return { token };
}

export async function retireDevice(principal: Principal, deviceId: string, context: { requestId?: string } = {}) {
  const me = signedIn(principal);
  const device = await deviceFor(me, deviceId, 'manage');
  const moved = await db().device.updateMany({ where: { id: device.id, status: 'ACTIVE' }, data: { status: 'RETIRED' } });
  if (moved.count === 0) throw errors.conflict('This device is already retired.');
  await recordAuditEvent({ action: 'DEVICE_RETIRED', actor: me.userId, subject: device.id, organizationId: device.organizationId, outcome: 'success', requestId: context.requestId });
  return { status: 'RETIRED' as const };
}

export const resolveSchema = z.object({ note: z.string().trim().max(300).optional() });

export async function resolveAlert(principal: Principal, alertId: string, raw: z.input<typeof resolveSchema>, context: { requestId?: string; now?: Date } = {}) {
  const me = signedIn(principal);
  const input = parse(resolveSchema, raw);
  const alert = await db().deviceAlert.findUnique({ where: { id: alertId }, select: { id: true, device: { select: { id: true, organizationId: true } } } });
  if (!alert || !can(me, READ, { organizationId: alert.device.organizationId })) throw errors.notFound('Alert');
  if (!can(me, MANAGE, { organizationId: alert.device.organizationId })) throw errors.forbidden(MANAGE);
  const moved = await db().deviceAlert.updateMany({ where: { id: alert.id, resolvedAt: null }, data: { resolvedAt: context.now ?? new Date(), resolvedByUserId: me.userId, resolutionNote: input.note || null, openKey: null } });
  if (moved.count === 0) throw errors.conflict('This alert is already resolved.');
  await recordAuditEvent({ action: 'DEVICE_ALERT_RESOLVED', actor: me.userId, subject: alert.id, organizationId: alert.device.organizationId, outcome: 'success', requestId: context.requestId });
  return { resolved: true };
}

// ---------------------------------------------------------------------------
// The device
// ---------------------------------------------------------------------------

export const telemetrySchema = z.object({
  readings: z
    .array(z.object({ metric, value: z.number().finite(), at: z.string().max(40).optional() }))
    .min(1, 'Send at least one reading.')
    .max(MAX_READINGS, `At most ${MAX_READINGS} readings at a time.`),
});

/** Readings from a device, authenticated by its token. */
export async function ingestTelemetry(authorization: string | null, raw: z.input<typeof telemetrySchema>, context: { requestId?: string; now?: Date } = {}) {
  const token = authorization?.startsWith('Device ') ? authorization.slice(7).trim() : '';
  if (!TOKEN.test(token)) throw errors.unauthenticated();
  const device = await db().device.findUnique({ where: { tokenHash: hashToken(token) }, include: { limits: true, organization: { select: { deletedAt: true } } } });
  if (!device || device.status !== 'ACTIVE' || device.organization.deletedAt) throw errors.unauthenticated();
  const input = parse(telemetrySchema, raw);
  const now = context.now ?? new Date();

  const readings = input.readings.map((r) => {
    let recordedAt = now;
    if (r.at) {
      const at = new Date(r.at);
      if (Number.isNaN(at.getTime())) throw errors.validation('Give reading times in ISO 8601.', { field: 'readings.at' });
      if (at.getTime() < now.getTime() - 7 * DAY) throw errors.validation('Readings older than a week are not accepted.', { field: 'readings.at' });
      // A device clock running ahead is held to the moment we received it.
      recordedAt = at > now ? now : at;
    }
    return { id: newId('telemetry'), deviceId: device.id, metric: r.metric, value: r.value, recordedAt, receivedAt: now };
  });

  const limitOf = new Map(device.limits.map((l) => [l.metric, l]));
  const breaches = new Map<string, { value: number; message: string }>();
  for (const r of readings) {
    if (breaches.has(r.metric)) continue;
    if (r.metric === FAULT_METRIC) {
      if (r.value > 0) breaches.set(r.metric, { value: r.value, message: `reported fault code ${r.value}` });
      continue;
    }
    const l = limitOf.get(r.metric);
    if (l?.min != null && r.value < l.min) breaches.set(r.metric, { value: r.value, message: `${r.metric} ${r.value} is below the lowest allowed (${l.min})` });
    else if (l?.max != null && r.value > l.max) breaches.set(r.metric, { value: r.value, message: `${r.metric} ${r.value} is above the highest allowed (${l.max})` });
  }

  const firstConnection = !device.connectedAt;
  const opened: Array<{ metric: string; message: string }> = [];
  await transaction(async (tx) => {
    await tx.deviceReading.createMany({ data: readings });
    await tx.device.update({ where: { id: device.id }, data: { lastSeenAt: now, ...(firstConnection ? { connectedAt: now } : {}) } });
    if (firstConnection) {
      await emitInTransaction(tx, 'DEVICE_CONNECTED', { deviceId: device.id, organizationId: device.organizationId, kind: device.kind }, { requestId: context.requestId ?? null, actor: `device:${device.id}` });
    }
    for (const [name, breach] of breaches) {
      const rows = await tx.$queryRaw<Array<{ metric: string }>>(
        Prisma.sql`INSERT INTO "device_alerts" ("id", "deviceId", "metric", "value", "message", "openKey", "openedAt")
                   VALUES (${newId('alert')}, ${device.id}, ${name}, ${breach.value}, ${breach.message}, ${`${device.id}:${name}`}, ${now})
                   ON CONFLICT ("openKey") DO NOTHING RETURNING "metric"`,
      );
      if (rows.length > 0) opened.push({ metric: name, message: breach.message });
    }
  });

  for (const alert of opened) {
    await notifyOrganizationAdmins({ organizationId: device.organizationId, notificationId: 'TL-NOTIF-DEVICE-ALERT-001', data: { device: device.name, message: alert.message }, linkUrl: `/account/organizations/${device.organizationId}/devices/${device.id}` });
  }
  return { accepted: readings.length, alertsOpened: opened.length };
}

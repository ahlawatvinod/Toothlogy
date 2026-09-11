/**
 * TOOTHLOGY OPERATIONS — district command centre
 *
 * One row per district: what was extracted, what became a pre-made account
 * or listing, what was claimed or activated, how many clinics are live, the
 * leads and bookings they received in the last 30 days, and the outreach
 * still open or overdue. Plus each operator's open, overdue and finished
 * work and calls in the last 7 days. Read-only; operators and leads alike.
 *
 * Every number is counted from the rows themselves — nothing is cached or
 * estimated — so a figure can always be traced to the records behind it.
 */

import { Prisma } from '@prisma/client';
import { errors } from '../kernel/errors';
import { db } from '../db/client';
import { can, isAuthenticated, type Principal } from '../rbac';
import { listDistricts } from '../india-data/districts';
import { WORK } from './outreach';

const DAY = 86_400_000;

type Count = { districtId: string | null; n: bigint };

export async function commandCenter(principal: Principal, filter: { regionId?: string } = {}, now: Date = new Date()) {
  if (!isAuthenticated(principal) || !can(principal, WORK)) throw errors.forbidden(WORK);
  const since30 = new Date(now.getTime() - 30 * DAY);
  const since7 = new Date(now.getTime() - 7 * DAY);

  const [districts, records, openTasks, overdueTasks, leads, bookings, liveClinics, agentTasks, agentOverdue, agentDone, agentCalls] = await Promise.all([
    listDistricts({ countryCode: 'IN', regionId: filter.regionId }),
    db().extractedRecord.groupBy({ by: ['districtId', 'entityType', 'status'], _count: true }),
    db().outreachTask.groupBy({ by: ['districtId'], where: { status: 'OPEN' }, _count: true }),
    db().outreachTask.groupBy({ by: ['districtId'], where: { status: 'OPEN', dueAt: { lt: now } }, _count: true }),
    db().$queryRaw<Count[]>(Prisma.sql`SELECT l."districtId", count(*)::bigint AS n FROM "leads" ld JOIN "locations" l ON l."id" = ld."locationId" WHERE ld."createdAt" >= ${since30} GROUP BY l."districtId"`),
    db().$queryRaw<Count[]>(Prisma.sql`SELECT l."districtId", count(*)::bigint AS n FROM "appointments" a JOIN "locations" l ON l."id" = a."locationId" WHERE a."createdAt" >= ${since30} GROUP BY l."districtId"`),
    db().$queryRaw<Count[]>(
      Prisma.sql`SELECT l."districtId", count(DISTINCT o."id")::bigint AS n FROM "organizations" o JOIN "locations" l ON l."organizationId" = o."id" WHERE o."status" = 'ACTIVE' AND o."deletedAt" IS NULL AND l."deletedAt" IS NULL GROUP BY l."districtId"`,
    ),
    db().outreachTask.groupBy({ by: ['assignedToUserId'], where: { status: 'OPEN', assignedToUserId: { not: null } }, _count: true }),
    db().outreachTask.groupBy({ by: ['assignedToUserId'], where: { status: 'OPEN', assignedToUserId: { not: null }, dueAt: { lt: now } }, _count: true }),
    db().outreachTask.groupBy({ by: ['assignedToUserId'], where: { status: 'DONE', completedAt: { gte: since7 }, assignedToUserId: { not: null } }, _count: true }),
    db().outreachActivity.groupBy({ by: ['actorUserId'], where: { type: 'CALL', createdAt: { gte: since7 } }, _count: true }),
  ]);

  const pick = (rows: Count[], id: string) => Number(rows.find((r) => r.districtId === id)?.n ?? 0);
  const task = (rows: Array<{ districtId: string | null; _count: number }>, id: string) => rows.find((r) => r.districtId === id)?._count ?? 0;
  const rowsFor = (id: string) => records.filter((r) => r.districtId === id);
  const sum = (rows: typeof records, test: (r: (typeof records)[number]) => boolean) => rows.filter(test).reduce((n, r) => n + r._count, 0);

  const perDistrict = districts.map((d) => {
    const own = rowsFor(d.id);
    return {
      id: d.id,
      name: d.name,
      state: d.state,
      records: sum(own, () => true),
      toReview: sum(own, (r) => r.status === 'NEW'),
      premadeDentists: sum(own, (r) => r.entityType === 'DENTIST' && r.status === 'ACCOUNT_CREATED'),
      activatedDentists: sum(own, (r) => r.status === 'ACTIVATED'),
      unclaimedListings: sum(own, (r) => r.entityType !== 'DENTIST' && r.status === 'ACCOUNT_CREATED'),
      claimedListings: sum(own, (r) => r.status === 'CLAIMED'),
      liveClinics: pick(liveClinics, d.id),
      leads30: pick(leads, d.id),
      bookings30: pick(bookings, d.id),
      openTasks: task(openTasks, d.id),
      overdueTasks: task(overdueTasks, d.id),
    };
  });

  const agentIds = [...new Set([...agentTasks, ...agentOverdue, ...agentDone].map((r) => r.assignedToUserId!).concat(agentCalls.map((r) => r.actorUserId)))];
  const names = new Map((await db().user.findMany({ where: { id: { in: agentIds } }, select: { id: true, displayName: true, email: true } })).map((u) => [u.id, u.displayName ?? u.email ?? u.id]));
  const agents = agentIds
    .map((userId) => ({
      userId,
      name: names.get(userId) ?? userId,
      open: agentTasks.find((r) => r.assignedToUserId === userId)?._count ?? 0,
      overdue: agentOverdue.find((r) => r.assignedToUserId === userId)?._count ?? 0,
      done7: agentDone.find((r) => r.assignedToUserId === userId)?._count ?? 0,
      calls7: agentCalls.find((r) => r.actorUserId === userId)?._count ?? 0,
    }))
    .sort((a, b) => b.open - a.open || a.name.localeCompare(b.name));

  const total = (key: keyof (typeof perDistrict)[number]) => perDistrict.reduce((n, d) => n + (typeof d[key] === 'number' ? (d[key] as number) : 0), 0);
  return {
    generatedAt: now.toISOString(),
    districts: perDistrict,
    totals: {
      records: total('records'),
      toReview: total('toReview'),
      premadeDentists: total('premadeDentists'),
      activatedDentists: total('activatedDentists'),
      unclaimedListings: total('unclaimedListings'),
      claimedListings: total('claimedListings'),
      liveClinics: total('liveClinics'),
      leads30: total('leads30'),
      bookings30: total('bookings30'),
      openTasks: total('openTasks'),
      overdueTasks: total('overdueTasks'),
    },
    agents,
  };
}

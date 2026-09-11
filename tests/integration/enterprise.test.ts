/**
 * TL-TEST-ENTERPRISE-001 — enterprise groups, agreements, service levels,
 * data residency and exchange rates.
 *
 * Only staff record agreements, one current per group, never for a member;
 * groups are one level deep. Tickets from a covered organization (the group
 * or a member) carry the service levels from the moment they open; internal
 * notes do not count as a first response; results are met, breached or
 * running. Residency is compared with the declared hosting region only, and
 * a required single sign-on shows as not connected. Exchange rates only from
 * staff, exact, and a cross-currency total only when every rate is known.
 */

import { afterAll, afterEach, beforeAll, beforeEach, expect, it } from 'vitest';
import { register } from '@/platform/auth/service';
import { createOrganization } from '@/platform/organizations/service';
import { openTicket, replyToTicket, setTicketStatus, supportQueue } from '@/platform/support/service';
import { endAgreement, groupConsole, recordAgreement, setGroupMembership } from '@/platform/enterprise/service';
import { approximateTotal, listRates, rateFor, recordRate } from '@/platform/globalization/exchange-rates';
import type { AuthenticatedPrincipal } from '@/platform/rbac';
import { assertSeeded, describeIntegration, disconnectTestDb, resetDatabase, testDb, useDatabaseAuditSink } from '../helpers/database';

const PASSWORD = 'a sufficiently long passphrase';
const DAY = 86_400_000;
const HOUR = 3_600_000;
const iso = (offsetDays: number) => new Date(Date.now() + offsetDays * DAY).toISOString().slice(0, 10);
const rand = () => Math.random().toString(36).slice(2);

function principal(userId: string, roles: string[], organizations: AuthenticatedPrincipal['organizations'] = []): AuthenticatedPrincipal {
  return { kind: 'user', userId, roles, organizations, sessionId: 'test-session' };
}

let seq = 0;
async function user(label: string) {
  seq += 1;
  const { userId } = await register({ email: `${label}-${seq}@example.test`, password: PASSWORD, displayName: `${label} ${seq}`, role: 'patient', acceptedTerms: true });
  await testDb().user.update({ where: { id: userId }, data: { emailVerifiedAt: new Date() } });
  return userId;
}

async function staffWith(role: 'platform_admin' | 'support_agent') {
  const id = await user(role);
  await testDb().roleAssignment.create({ data: { id: `ra_${rand()}`, userId: id, roleKey: role } });
  return principal(id, [role]);
}

async function org(slug: string) {
  const ownerId = await user(`owner-${slug}`);
  const { organizationId } = await createOrganization({ name: `Clinic ${slug}`, slug, type: 'CLINIC', countryCode: 'IN', timezone: 'Asia/Kolkata' }, ownerId);
  return { organizationId, ownerId, admin: principal(ownerId, ['patient'], [{ organizationId, roles: ['clinic_admin'] }]) };
}

describeIntegration('Enterprise and exchange rates', () => {
  let staff: AuthenticatedPrincipal;
  const terms = (organizationId: string, overrides: Record<string, unknown> = {}) => ({ organizationId, reference: `ENT-${rand()}`, startsOn: iso(-1), endsOn: iso(365), firstResponseHours: 4, resolutionHours: 48, dataResidency: 'IN', ...overrides });

  beforeAll(async () => {
    await assertSeeded();
  });
  afterAll(async () => {
    await disconnectTestDb();
  });
  beforeEach(async () => {
    await resetDatabase();
    useDatabaseAuditSink();
    staff = await staffWith('platform_admin');
  });
  afterEach(() => {
    delete process.env.TOOTHLOGY_HOSTING_REGION;
  });

  it('lets only staff record agreements for groups, one current per group, with members one level deep', async () => {
    const chain = await org('smilechain');
    const a = await org('chain-a');
    const b = await org('chain-b');
    const lone = await org('lone');
    const reason = 'Signed group contract';

    await expect(recordAgreement(chain.admin, terms(chain.organizationId))).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(recordAgreement(staff, terms(chain.organizationId, { endsOn: iso(-5) }))).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
    await expect(recordAgreement(staff, terms(chain.organizationId, { resolutionHours: 2 }))).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
    await expect(recordAgreement(staff, terms(chain.organizationId, { dataResidency: 'ZZ' }))).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });

    await setGroupMembership(staff, { action: 'LINK', groupOrganizationId: chain.organizationId, memberOrganizationId: a.organizationId, reason });
    await setGroupMembership(staff, { action: 'LINK', groupOrganizationId: chain.organizationId, memberOrganizationId: b.organizationId, reason });
    await expect(setGroupMembership(staff, { action: 'LINK', groupOrganizationId: a.organizationId, memberOrganizationId: lone.organizationId, reason })).rejects.toMatchObject({ code: 'PRECONDITION_FAILED' }); // a group has no group
    await expect(setGroupMembership(staff, { action: 'LINK', groupOrganizationId: lone.organizationId, memberOrganizationId: a.organizationId, reason })).rejects.toMatchObject({ code: 'PRECONDITION_FAILED' }); // already in one
    await expect(setGroupMembership(staff, { action: 'LINK', groupOrganizationId: lone.organizationId, memberOrganizationId: chain.organizationId, reason })).rejects.toMatchObject({ code: 'PRECONDITION_FAILED' }); // has members
    await expect(setGroupMembership(staff, { action: 'LINK', groupOrganizationId: chain.organizationId, memberOrganizationId: chain.organizationId, reason })).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
    await expect(setGroupMembership(chain.admin, { action: 'UNLINK', memberOrganizationId: b.organizationId, reason })).rejects.toMatchObject({ code: 'FORBIDDEN' });

    await expect(recordAgreement(staff, terms(a.organizationId))).rejects.toMatchObject({ code: 'PRECONDITION_FAILED' });
    const { agreementId } = await recordAgreement(staff, terms(chain.organizationId, { ssoRequired: true }));
    await expect(recordAgreement(staff, terms(chain.organizationId))).rejects.toMatchObject({ code: 'CONFLICT' });
    expect(await testDb().inAppNotification.count({ where: { userId: chain.ownerId, notificationId: 'TL-NOTIF-ENTERPRISE-001' } })).toBe(3); // two members joined, agreement recorded

    const memberView = await groupConsole(a.admin, a.organizationId);
    expect(memberView.organization.parent?.id).toBe(chain.organizationId);
    expect(memberView.agreement?.id).toBe(agreementId);
    expect(memberView.agreement?.sso).toEqual({ required: true, connected: false });
    expect((await groupConsole(chain.admin, chain.organizationId)).organization.children.map((c) => c.id).sort()).toEqual([a.organizationId, b.organizationId].sort());
    await expect(groupConsole(lone.admin, chain.organizationId)).rejects.toMatchObject({ code: 'NOT_FOUND' });

    // Residency is only ever compared with what the deployment declares.
    expect(memberView.agreement?.residency).toEqual({ required: 'IN', hosted: null, met: false });
    process.env.TOOTHLOGY_HOSTING_REGION = 'in';
    expect((await groupConsole(chain.admin, chain.organizationId)).agreement?.residency).toEqual({ required: 'IN', hosted: 'IN', met: true });

    await setGroupMembership(staff, { action: 'UNLINK', memberOrganizationId: b.organizationId, reason: 'Clinic sold' });
    expect((await testDb().organization.findUniqueOrThrow({ where: { id: b.organizationId } })).parentOrganizationId).toBeNull();
    await endAgreement(staff, agreementId, { reason: 'Contract expired early' });
    await expect(endAgreement(staff, agreementId, { reason: 'Again' })).rejects.toMatchObject({ code: 'PRECONDITION_FAILED' });
    await recordAgreement(staff, terms(chain.organizationId));
    expect(await testDb().enterpriseAgreement.count({ where: { organizationId: chain.organizationId, status: 'ACTIVE' } })).toBe(1);
  });

  it('stamps service levels on tickets from covered organizations and reports met, breached and running', async () => {
    const agent = await staffWith('support_agent');
    const chain = await org('slachain');
    const member = await org('sla-member');
    const lone = await org('sla-lone');
    await setGroupMembership(staff, { action: 'LINK', groupOrganizationId: chain.organizationId, memberOrganizationId: member.organizationId, reason: 'Group contract' });
    const { agreementId } = await recordAgreement(staff, terms(chain.organizationId));
    const ask = (who: typeof member, organizationId?: string) => openTicket(who.admin, { category: 'ACCOUNT', ...(organizationId ? { organizationId } : {}), subject: 'Cannot add a receptionist', body: 'The invitation link says it has expired.' });

    const before = Date.now();
    const covered = await ask(member, member.organizationId);
    const late = await ask(member, member.organizationId);
    const uncovered = await ask(lone, lone.organizationId);
    const personal = await ask(member);
    const ticket = await testDb().supportTicket.findUniqueOrThrow({ where: { id: covered.ticketId } });
    expect(ticket.enterpriseAgreementId).toBe(agreementId);
    expect(ticket.slaFirstResponseDueAt!.getTime()).toBeGreaterThanOrEqual(before + 4 * HOUR);
    expect(ticket.slaResolveDueAt!.getTime() - ticket.slaFirstResponseDueAt!.getTime()).toBe(44 * HOUR);
    for (const id of [uncovered.ticketId, personal.ticketId]) {
      expect(await testDb().supportTicket.findUniqueOrThrow({ where: { id } })).toMatchObject({ enterpriseAgreementId: null, slaFirstResponseDueAt: null });
    }

    // A note is not an answer; the first real reply is.
    await replyToTicket(agent, covered.ticketId, { body: 'Checking the invitation service logs.', internal: true });
    expect((await testDb().supportTicket.findUniqueOrThrow({ where: { id: covered.ticketId } })).firstRespondedAt).toBeNull();
    await replyToTicket(agent, covered.ticketId, { body: 'We have sent you a fresh invitation.' });
    expect((await testDb().supportTicket.findUniqueOrThrow({ where: { id: covered.ticketId } })).firstRespondedAt).not.toBeNull();
    await setTicketStatus(agent, covered.ticketId, { status: 'RESOLVED' });

    // The other covered ticket went unanswered past its deadline.
    await testDb().supportTicket.update({ where: { id: late.ticketId }, data: { slaFirstResponseDueAt: new Date(Date.now() - HOUR) } });
    expect((await supportQueue(agent))[0]!.id).toBe(late.ticketId);

    const sla = (await groupConsole(chain.admin, chain.organizationId)).agreement!.sla;
    expect(sla).toEqual({ tickets: 2, firstResponse: { MET: 1, BREACHED: 1, RUNNING: 0 }, resolution: { MET: 1, BREACHED: 0, RUNNING: 1 } });
  });

  it('records exchange rates only from staff, exactly, and totals across currencies only when every rate is known', async () => {
    const outsider = principal(await user('outsider'), ['patient']);
    const rate = { baseCurrency: 'USD', quoteCurrency: 'INR', rate: '83.25', source: 'RBI reference rate', asOf: iso(-1) };
    await expect(recordRate(outsider, rate)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(recordRate(staff, { ...rate, quoteCurrency: 'USD' })).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
    await expect(recordRate(staff, { ...rate, rate: '0' })).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
    await expect(recordRate(staff, { ...rate, rate: '83.1234567' })).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
    await expect(recordRate(staff, { ...rate, baseCurrency: 'XYZ' })).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
    await expect(recordRate(staff, { ...rate, asOf: iso(5) })).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
    await recordRate(staff, rate);
    await expect(recordRate(staff, rate)).rejects.toMatchObject({ code: 'CONFLICT' });
    expect((await listRates(staff))[0]).toMatchObject({ rate: '83.25', rateMicros: BigInt(83_250_000) });

    expect((await rateFor('USD', 'INR'))?.rateMicros).toBe(BigInt(83_250_000));
    expect((await rateFor('INR', 'USD'))?.rateMicros).toBe(BigInt(12_012)); // 1 / 83.25, to six places
    expect(await rateFor('EUR', 'INR')).toBeNull();
    expect(await approximateTotal([{ currency: 'INR', minor: 100_000 }, { currency: 'USD', minor: 1_000 }], 'INR')).toMatchObject({ complete: true, currency: 'INR', minor: BigInt(183_250) });
    expect(await approximateTotal([{ currency: 'INR', minor: 100 }, { currency: 'EUR', minor: 500 }], 'INR')).toEqual({ complete: false, currency: 'INR', missing: ['EUR'] });
    await expect(testDb().$executeRawUnsafe(`INSERT INTO "exchange_rates" ("id","baseCurrency","quoteCurrency","rateMicros","source","asOf","recordedByUserId") VALUES ('fxr_bad','GBP','INR',0,'x',now(),'usr_x')`)).rejects.toThrow();
  });
});

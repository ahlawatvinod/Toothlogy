/**
 * TL-TEST-OPERATIONS-001 — lead work, outreach and the district command centre.
 *
 * Practice: assign only to members, calls only once contact is visible, a
 * connected call marks an accepted lead contacted, follow-ups remind once,
 * closed leads take notes only, other practices see nothing. Toothlogy:
 * outreach one-open-per-subject, purpose checks, bulk round-robin that never
 * doubles, operator visibility and claiming, closing rules, activation
 * invitations refused while email/SMS are not configured, command-centre
 * counts, staff-only access.
 */

import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';
import { register } from '@/platform/auth/service';
import { createOrganization } from '@/platform/organizations/service';
import { createLocation } from '@/platform/organizations/locations';
import { listLeads } from '@/platform/leads/service';
import { sendDueLeadFollowUps, workOnLead } from '@/platform/leads/work';
import { matchDistrict } from '@/platform/india-data/districts';
import { createPremadeAccount, importExtractionBatch, listExtractedRecords } from '@/platform/india-data/extraction';
import { assignOutreachTask, bulkCreateOutreach, closeOutreachTask, createOutreachTask, listOperationsAgents, listOutreachTasks, logOutreachActivity, sendActivationInvite } from '@/platform/operations/outreach';
import { commandCenter } from '@/platform/operations/command-center';
import { emailProvider, smsProvider, type EmailMessage } from '@/platform/notifications/ports';
import type { AuthenticatedPrincipal } from '@/platform/rbac';
import { assertSeeded, describeIntegration, disconnectTestDb, resetDatabase, testDb, useDatabaseAuditSink } from '../helpers/database';

const PASSWORD = 'a sufficiently long passphrase';
const TZ = 'Asia/Kolkata';
const DAY = 86_400_000;

function principal(userId: string, roles: string[], organizations: AuthenticatedPrincipal['organizations'] = []): AuthenticatedPrincipal {
  return { kind: 'user', userId, roles, organizations, sessionId: 'test-session' };
}

let seq = 0;
async function user(label: string, role: 'dentist' | 'patient' = 'patient') {
  seq += 1;
  const { userId } = await register({ email: `${label}-${seq}@example.test`, password: PASSWORD, displayName: `${label} ${seq}`, role, acceptedTerms: true });
  await testDb().user.update({ where: { id: userId }, data: { emailVerifiedAt: new Date() } });
  return userId;
}

async function staffWith(role: 'platform_admin' | 'support_agent', label: string) {
  const id = await user(label);
  await testDb().roleAssignment.create({ data: { id: `ra_${Math.random().toString(36).slice(2)}`, userId: id, roleKey: role } });
  return principal(id, [role]);
}

/** A practice with an owner (administrator), a staff member and a delivered callback lead. */
async function practiceWithLead(slug: string) {
  const ownerId = await user(`owner-${slug}`, 'dentist');
  const { organizationId } = await createOrganization({ name: `Clinic ${slug}`, slug, type: 'CLINIC', countryCode: 'IN', timezone: TZ }, ownerId);
  const { locationId } = await createLocation(organizationId, { name: 'Main', slug: 'main', timezone: TZ, isPrimary: true, latitude: 21.25, longitude: 81.63, hours: [] }, ownerId);
  const staffId = await user(`staff-${slug}`);
  await testDb().organizationMember.create({ data: { id: `om_${Math.random().toString(36).slice(2)}`, userId: staffId, organizationId, roleKey: 'clinic_staff' } });
  const patientId = await user(`patient-${slug}`);
  const leadId = `lead_${Math.random().toString(36).slice(2)}`;
  await testDb().lead.create({ data: { id: leadId, patientUserId: patientId, organizationId, locationId, source: 'CALLBACK_REQUEST', status: 'ACCEPTED', dedupeKey: leadId, deliveredAt: new Date(), acceptedAt: new Date() } });
  return {
    organizationId,
    leadId,
    ownerId,
    staffId,
    owner: principal(ownerId, ['dentist'], [{ organizationId, roles: ['clinic_admin'] }]),
    staff: principal(staffId, ['patient'], [{ organizationId, roles: ['clinic_staff'] }]),
  };
}

const emails: EmailMessage[] = [];
const receipt = (channel: 'email' | 'sms') => ({ providerMessageId: `test-${Math.random()}`, channel, acceptedAt: new Date(), status: 'accepted' as const });

describeIntegration('Operations', () => {
  let lead: AuthenticatedPrincipal;
  let agentA: AuthenticatedPrincipal;
  let agentB: AuthenticatedPrincipal;
  let outsider: AuthenticatedPrincipal;
  let raipurId: string;

  beforeAll(async () => {
    await assertSeeded();
    raipurId = (await matchDistrict('IN', 'Chhattisgarh', 'Raipur'))!.id;
  });
  afterAll(async () => {
    emailProvider.set(null);
    smsProvider.set(null);
    await disconnectTestDb();
  });
  beforeEach(async () => {
    await resetDatabase();
    useDatabaseAuditSink();
    emailProvider.set(null);
    smsProvider.set(null);
    emails.length = 0;
    lead = await staffWith('platform_admin', 'ops-lead');
    agentA = await staffWith('support_agent', 'agent-a');
    agentB = await staffWith('support_agent', 'agent-b');
    outsider = principal(await user('outsider'), ['patient']);
  });

  async function premade() {
    await importExtractionBatch(lead, {
      source: 'CG list',
      entityType: 'DENTIST',
      countryCode: 'IN',
      rows: [{ name: 'Dr. Meena Rao', mobile: '9827055555', email: 'meena@example.test', district: 'Raipur', state: 'Chhattisgarh' }],
    });
    const [record] = await listExtractedRecords(lead, { entityType: 'DENTIST' });
    await createPremadeAccount(lead, record!.id);
    return record!.id;
  }

  async function listings(count: number) {
    await importExtractionBatch(lead, {
      source: 'Clinic survey',
      entityType: 'CLINIC',
      countryCode: 'IN',
      districtId: raipurId,
      rows: Array.from({ length: count + 1 }, (_, i) => ({ name: `Raipur Dental ${i + 1}`, phone: `98270${String(10000 + i)}`, address: 'Station Road', pincode: '492001' })),
    });
    const records = (await listExtractedRecords(lead, { entityType: 'CLINIC' })).sort((a, b) => a.rowNumber - b.rowNumber);
    for (const r of records.slice(0, count)) await createPremadeAccount(lead, r.id);
    return records;
  }

  // ---------------------------------------------------------------------------
  // Practice lead work
  // ---------------------------------------------------------------------------

  it('assigns only to members, logs calls only once contact is visible, and moves an accepted lead to contacted on a connected call', async () => {
    const p = await practiceWithLead('work1');
    const other = await practiceWithLead('work2');

    await expect(workOnLead(p.owner, p.leadId, { kind: 'ASSIGN', assigneeUserId: other.staffId })).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
    await expect(workOnLead(p.staff, p.leadId, { kind: 'ASSIGN', assigneeUserId: p.staffId })).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(workOnLead(other.owner, p.leadId, { kind: 'NOTE', note: 'peeking' })).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(workOnLead(outsider, p.leadId, { kind: 'NOTE', note: 'peeking' })).rejects.toMatchObject({ code: 'NOT_FOUND' });
    // Not assigned yet: a read-only member may not work it.
    await expect(workOnLead(p.staff, p.leadId, { kind: 'NOTE', note: 'hello' })).rejects.toMatchObject({ code: 'FORBIDDEN' });

    await workOnLead(p.owner, p.leadId, { kind: 'ASSIGN', assigneeUserId: p.staffId });
    expect(await testDb().inAppNotification.count({ where: { userId: p.staffId, notificationId: 'TL-NOTIF-LEAD-ASSIGNED-001' } })).toBe(1);

    // A callback lead that is neither free nor paid hides the number: no call can be logged.
    await expect(workOnLead(p.staff, p.leadId, { kind: 'CALL', outcome: 'CONNECTED' })).rejects.toMatchObject({ code: 'PRECONDITION_FAILED' });
    await testDb().lead.update({ where: { id: p.leadId }, data: { billingStatus: 'FREE' } });
    const called = await workOnLead(p.staff, p.leadId, { kind: 'CALL', outcome: 'CONNECTED', note: 'Wants a cleaning' });
    expect(called.status).toBe('CONTACTED');
    const events = await testDb().leadEvent.findMany({ where: { leadId: p.leadId }, orderBy: { createdAt: 'asc' } });
    expect(events.map((e) => e.action)).toEqual(['ASSIGNED', 'CALL_LOGGED']);
    expect(events[1]).toMatchObject({ fromStatus: 'ACCEPTED', toStatus: 'CONTACTED', actorUserId: p.staffId });

    const [presented] = await listLeads(p.owner, p.organizationId);
    expect(presented).toMatchObject({ assignedToUserId: p.staffId, contactVisible: true, status: 'CONTACTED' });
    expect(presented!.assignedToName).toContain('staff-work1');
    expect(presented!.workLog.map((w) => w.action)).toEqual(['CALL_LOGGED', 'ASSIGNED']);
    expect(await testDb().auditEvent.count({ where: { action: { in: ['LEAD_WORK_ASSIGN', 'LEAD_WORK_CALL'] } } })).toBe(2);
  });

  it('schedules follow-ups in the future only, reminds the assignee once, and takes only notes on a closed lead', async () => {
    const p = await practiceWithLead('follow');
    await workOnLead(p.owner, p.leadId, { kind: 'ASSIGN', assigneeUserId: p.staffId });
    const now = new Date();
    await expect(workOnLead(p.staff, p.leadId, { kind: 'FOLLOW_UP', at: new Date(now.getTime() - 3_600_000).toISOString() })).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
    await workOnLead(p.staff, p.leadId, { kind: 'FOLLOW_UP', at: new Date(now.getTime() + DAY).toISOString() });

    expect(await sendDueLeadFollowUps(now)).toEqual({ due: 0, sent: 0 });
    const later = new Date(now.getTime() + 2 * DAY);
    const [first, second] = await Promise.all([sendDueLeadFollowUps(later), sendDueLeadFollowUps(later)]);
    expect(first.sent + second.sent).toBe(1);
    expect(await sendDueLeadFollowUps(later)).toEqual({ due: 0, sent: 0 });
    expect(await testDb().inAppNotification.count({ where: { userId: p.staffId, notificationId: 'TL-NOTIF-LEAD-FOLLOW-UP-001' } })).toBe(1);

    // Rescheduling re-arms the reminder.
    await workOnLead(p.staff, p.leadId, { kind: 'FOLLOW_UP', at: new Date(now.getTime() + 3 * DAY).toISOString() }, { now });
    expect((await sendDueLeadFollowUps(new Date(now.getTime() + 4 * DAY))).sent).toBe(1);

    await testDb().lead.update({ where: { id: p.leadId }, data: { status: 'COMPLETED' } });
    await expect(workOnLead(p.staff, p.leadId, { kind: 'FOLLOW_UP', at: new Date(now.getTime() + DAY).toISOString() })).rejects.toMatchObject({ code: 'PRECONDITION_FAILED' });
    await expect(workOnLead(p.owner, p.leadId, { kind: 'ASSIGN', assigneeUserId: null })).rejects.toMatchObject({ code: 'PRECONDITION_FAILED' });
    await workOnLead(p.staff, p.leadId, { kind: 'NOTE', note: 'Came in for the cleaning.' });
  });

  // ---------------------------------------------------------------------------
  // Outreach
  // ---------------------------------------------------------------------------

  it('opens one outreach task per subject, checks the purpose fits, and lets only leads create or assign others', async () => {
    const recordId = await premade();
    expect((await listOperationsAgents()).map((a) => a.userId).sort()).toEqual([lead.userId, agentA.userId, agentB.userId].sort());

    await expect(createOutreachTask(agentA, { extractedRecordId: recordId, purpose: 'ACTIVATE_ACCOUNT' })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(createOutreachTask(lead, { extractedRecordId: recordId, purpose: 'CLAIM_LISTING' })).rejects.toMatchObject({ code: 'PRECONDITION_FAILED' });
    await expect(createOutreachTask(lead, { extractedRecordId: recordId, purpose: 'ACTIVATE_ACCOUNT', assignedToUserId: outsider.userId })).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
    await expect(createOutreachTask(lead, { purpose: 'ACTIVATE_ACCOUNT' })).rejects.toThrow();

    const { taskId } = await createOutreachTask(lead, { extractedRecordId: recordId, purpose: 'ACTIVATE_ACCOUNT', assignedToUserId: agentA.userId });
    const task = await testDb().outreachTask.findUniqueOrThrow({ where: { id: taskId } });
    expect(task).toMatchObject({ districtId: raipurId, openKey: `record:${recordId}`, title: 'Invite to activate: Meena Rao', status: 'OPEN' });
    await expect(createOutreachTask(lead, { extractedRecordId: recordId, purpose: 'ACTIVATE_ACCOUNT' })).rejects.toMatchObject({ code: 'CONFLICT' });
    // The database refuses a task with no subject even if the service were bypassed.
    await expect(testDb().$executeRawUnsafe(`INSERT INTO "outreach_tasks" ("id","purpose","title","createdByUserId","updatedAt") VALUES ('otk_bad','RETENTION','x','u',now())`)).rejects.toThrow();

    // Only leads reassign; an operator may take only an unassigned task.
    await expect(assignOutreachTask(agentB, taskId, { assignedToUserId: agentB.userId })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await assignOutreachTask(lead, taskId, { assignedToUserId: null });
    await assignOutreachTask(agentB, taskId, { assignedToUserId: agentB.userId });
    await expect(assignOutreachTask(agentA, taskId, { assignedToUserId: agentA.userId })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(createOutreachTask(outsider, { extractedRecordId: recordId, purpose: 'ACTIVATE_ACCOUNT' })).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('bulk-opens outreach for a district round-robin and never doubles a subject', async () => {
    await listings(4);
    const first = await bulkCreateOutreach(lead, { districtId: raipurId, purpose: 'CLAIM_LISTING', assigneeUserIds: [agentA.userId, agentB.userId] });
    expect(first).toEqual({ candidates: 4, created: 4 });
    const tasks = await testDb().outreachTask.findMany({ where: { districtId: raipurId } });
    expect(tasks.filter((t) => t.assignedToUserId === agentA.userId)).toHaveLength(2);
    expect(tasks.filter((t) => t.assignedToUserId === agentB.userId)).toHaveLength(2);
    expect(await bulkCreateOutreach(lead, { districtId: raipurId, purpose: 'CLAIM_LISTING', assigneeUserIds: [agentA.userId] })).toEqual({ candidates: 0, created: 0 });
    await expect(bulkCreateOutreach(agentA, { districtId: raipurId, purpose: 'CLAIM_LISTING' })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(bulkCreateOutreach(lead, { districtId: 'dst_nope', purpose: 'CLAIM_LISTING' })).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
    await expect(bulkCreateOutreach(lead, { districtId: raipurId, purpose: 'CLAIM_LISTING', assigneeUserIds: [outsider.userId] })).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
  });

  it('shows operators their own and unassigned work, claims on first log, and keeps closing rules', async () => {
    await listings(3);
    await bulkCreateOutreach(lead, { districtId: raipurId, purpose: 'CLAIM_LISTING', assigneeUserIds: [agentA.userId], limit: 2 });
    await bulkCreateOutreach(lead, { districtId: raipurId, purpose: 'CLAIM_LISTING' }); // the third, unassigned

    expect(await listOutreachTasks(agentA, { scope: 'mine' })).toHaveLength(2);
    expect(await listOutreachTasks(agentB, { scope: 'mine' })).toHaveLength(0);
    const unassigned = await listOutreachTasks(agentB, { scope: 'unassigned' });
    expect(unassigned).toHaveLength(1);
    // "Everyone's" is for leads; an operator asking for it gets their own and unassigned.
    expect(await listOutreachTasks(agentB, { scope: 'all' })).toHaveLength(1);
    expect(await listOutreachTasks(lead, { scope: 'all' })).toHaveLength(3);
    await expect(listOutreachTasks(outsider, {})).rejects.toMatchObject({ code: 'FORBIDDEN' });

    const aTask = (await listOutreachTasks(agentA, { scope: 'mine' }))[0]!;
    await expect(logOutreachActivity(agentB, aTask.id, { type: 'CALL', outcome: 'NO_ANSWER' })).rejects.toMatchObject({ code: 'PRECONDITION_FAILED' });
    await expect(logOutreachActivity(agentA, aTask.id, { type: 'CALL' })).rejects.toThrow();
    await logOutreachActivity(agentA, aTask.id, { type: 'CALL', outcome: 'CALLBACK_REQUESTED', note: 'Owner in surgery', nextDueAt: new Date(Date.now() + DAY).toISOString() });

    // Logging on the unassigned task takes it.
    await logOutreachActivity(agentB, unassigned[0]!.id, { type: 'VISIT', outcome: 'INTERESTED' });
    expect((await testDb().outreachTask.findUniqueOrThrow({ where: { id: unassigned[0]!.id } })).assignedToUserId).toBe(agentB.userId);

    await expect(closeOutreachTask(agentA, aTask.id, { action: 'COMPLETE' })).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
    await expect(closeOutreachTask(agentA, aTask.id, { action: 'CANCEL', note: 'no' })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await closeOutreachTask(agentA, aTask.id, { action: 'COMPLETE', outcome: 'ONBOARDED' });
    const done = await testDb().outreachTask.findUniqueOrThrow({ where: { id: aTask.id }, include: { activities: true } });
    expect(done).toMatchObject({ status: 'DONE', outcome: 'ONBOARDED', openKey: null });
    expect(done.activities.map((a) => a.type).sort()).toEqual(['CALL', 'NOTE']);
    await expect(logOutreachActivity(agentA, aTask.id, { type: 'NOTE', note: 'late' })).rejects.toMatchObject({ code: 'PRECONDITION_FAILED' });
    // Closed, the subject may get a new task.
    await createOutreachTask(lead, { extractedRecordId: done.extractedRecordId!, purpose: 'CLAIM_LISTING' });
  });

  it('refuses activation invitations while email or SMS is not configured, and sends through the activation flow when they are', async () => {
    const recordId = await premade();
    const { taskId } = await createOutreachTask(lead, { extractedRecordId: recordId, purpose: 'ACTIVATE_ACCOUNT', assignedToUserId: agentA.userId });
    await expect(sendActivationInvite(agentA, taskId)).rejects.toMatchObject({ code: 'NOT_CONFIGURED' });
    expect(await testDb().outreachActivity.count({ where: { taskId } })).toBe(0);

    emailProvider.set({ send: async (m) => (emails.push(m), receipt('email')) });
    smsProvider.set({ send: async () => receipt('sms') });
    await expect(sendActivationInvite(agentB, taskId)).rejects.toMatchObject({ code: 'PRECONDITION_FAILED' });
    expect(await sendActivationInvite(agentA, taskId)).toEqual({ sent: true });
    expect(emails).toHaveLength(1);
    expect(emails[0]!.to).toBe('meena@example.test');
    expect(emails[0]!.textBody).toMatch(/\/activate\?token=/);
    expect(await testDb().outreachActivity.count({ where: { taskId, type: 'EMAIL' } })).toBe(1);

    // A listing task has no account to invite.
    const records = await listings(1);
    const listingTask = await createOutreachTask(lead, { extractedRecordId: records[0]!.id, purpose: 'CLAIM_LISTING', assignedToUserId: agentA.userId });
    await expect(sendActivationInvite(agentA, listingTask.taskId)).rejects.toMatchObject({ code: 'PRECONDITION_FAILED' });
  });

  it('counts the command centre from the rows, per district and per operator, for staff only', async () => {
    await premade();
    await listings(2);
    await bulkCreateOutreach(lead, { districtId: raipurId, purpose: 'CLAIM_LISTING', assigneeUserIds: [agentA.userId] });
    const [task] = await listOutreachTasks(agentA, { scope: 'mine' });
    await logOutreachActivity(agentA, task!.id, { type: 'CALL', outcome: 'NO_ANSWER' });
    await testDb().outreachTask.update({ where: { id: task!.id }, data: { dueAt: new Date(Date.now() - DAY) } });

    const data = await commandCenter(agentA);
    const raipur = data.districts.find((d) => d.id === raipurId)!;
    expect(raipur).toMatchObject({ records: 4, toReview: 1, premadeDentists: 1, unclaimedListings: 2, claimedListings: 0, activatedDentists: 0, openTasks: 2, overdueTasks: 1 });
    expect(data.totals.openTasks).toBe(2);
    expect(data.agents.find((a) => a.userId === agentA.userId)).toMatchObject({ open: 2, overdue: 1, done7: 0, calls7: 1 });
    await expect(commandCenter(outsider)).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
});

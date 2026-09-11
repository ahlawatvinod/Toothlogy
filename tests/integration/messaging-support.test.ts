/**
 * TL-TEST-MESSAGING-SUPPORT-001 — patient–practice conversations and support tickets.
 *
 * Messaging: only after an appointment, one open conversation per patient,
 * practice and appointment; each side sees only its own; unread markers;
 * closing; daily limit; notifications without content.
 * Support: open by category, staff replies and internal notes (never shown
 * to the requester), statuses, reopening on the requester's reply, closing,
 * assignment to the support team only, daily limit, access.
 */

import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';
import { register } from '@/platform/auth/service';
import { createOrganization } from '@/platform/organizations/service';
import { createLocation } from '@/platform/organizations/locations';
import { addQualification, claimPractice, confirmPractice, submitForVerification, upsertDentistProfile } from '@/platform/dentists/service';
import { reviewVerification } from '@/platform/verification/service';
import { availableSlots, localDateOf } from '@/platform/appointments/availability';
import { bookAppointment } from '@/platform/appointments/service';
import { closeThread, getThread, listPatientThreads, listPracticeThreads, messageablePractices, postMessage, startThread } from '@/platform/messaging/service';
import { assignTicket, getTicket, myTickets, openTicket, replyToTicket, setTicketStatus, supportAgents, supportQueue } from '@/platform/support/service';
import { registerPlatformSubscribers, resetPlatformSubscribers } from '@/platform/events/subscribers';
import { addDays } from '@/lib/zoned-time';
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

async function practice(slug: string) {
  const reviewerId = await user('reviewer');
  await testDb().roleAssignment.create({ data: { id: `ra_${Math.random().toString(36).slice(2)}`, userId: reviewerId, roleKey: 'moderator' } });
  const ownerId = await user(`owner-${slug}`, 'dentist');
  const { organizationId } = await createOrganization({ name: `Clinic ${slug}`, slug, type: 'CLINIC', countryCode: 'IN', timezone: TZ }, ownerId);
  const { locationId } = await createLocation(organizationId, { name: 'Main', slug: 'main', timezone: TZ, isPrimary: true, latitude: 21.25, longitude: 81.63, hours: [0, 1, 2, 3, 4, 5, 6].map((d) => ({ dayOfWeek: d, opensAtMinutes: 540, closesAtMinutes: 1020 })) }, ownerId);
  await testDb().location.update({ where: { id: locationId }, data: { observesPublicHolidays: false, chairs: 4 } });
  const dentistUserId = await user(`dr-${slug}`, 'dentist');
  await upsertDentistProfile(dentistUserId, { slug: `dr-${slug}`, bio: 'A practising dentist with more than ten years of clinical experience in general and restorative dentistry.', languages: ['en'], specialtyKeys: ['general_dentistry'] });
  await addQualification(dentistUserId, { degree: 'BDS', institution: 'Government Dental College', year: 2012, registrationNumber: `DCI-${slug}`, registrationBody: 'Dental Council of India' });
  const { verificationRequestId } = await submitForVerification(dentistUserId);
  await reviewVerification({ verificationRequestId, decision: 'APPROVED' }, reviewerId);
  const { practiceId } = await claimPractice(dentistUserId, locationId);
  await confirmPractice(practiceId, organizationId, ownerId);
  await testDb().dentistPractice.update({ where: { id: practiceId }, data: { autoConfirm: true, minNoticeMinutes: 60 } });
  const staffId = await user(`staff-${slug}`);
  await testDb().organizationMember.create({ data: { id: `om_${Math.random().toString(36).slice(2)}`, userId: staffId, organizationId, roleKey: 'clinic_staff' } });
  return {
    organizationId,
    ownerId,
    practiceId,
    admin: principal(ownerId, ['dentist'], [{ organizationId, roles: ['clinic_admin'] }]),
    staff: principal(staffId, ['patient'], [{ organizationId, roles: ['clinic_staff'] }]),
  };
}

let slotIndex = 0;
async function book(p: Awaited<ReturnType<typeof practice>>, patient: AuthenticatedPrincipal) {
  const date = addDays(localDateOf(new Date(), TZ), 1);
  const { slots } = await availableSlots({ practiceId: p.practiceId, type: 'CLINIC', fromDate: date, toDate: date });
  const { appointment } = await bookAppointment(patient, { practiceId: p.practiceId, startsAt: slots[slotIndex++ % slots.length]!.startsAt });
  return appointment.id;
}

describeIntegration('Messaging and support', () => {
  beforeAll(async () => {
    await assertSeeded();
    resetPlatformSubscribers();
    registerPlatformSubscribers();
  });
  afterAll(async () => {
    resetPlatformSubscribers();
    await disconnectTestDb();
  });
  beforeEach(async () => {
    await resetDatabase();
    useDatabaseAuditSink();
    slotIndex = 0;
  });

  it('lets a patient write only to a practice they have an appointment with, one open conversation at a time', async () => {
    const p = await practice('msg1');
    const other = await practice('msg1-other');
    const patient = principal(await user('patient'), ['patient']);
    const stranger = principal(await user('stranger'), ['patient']);

    await expect(startThread(patient, { organizationId: p.organizationId, subject: 'Question', body: 'Hello there' })).rejects.toMatchObject({ code: 'PRECONDITION_FAILED' });
    const appointmentId = await book(p, patient);
    expect((await messageablePractices(patient)).map((m) => m.organizationId)).toEqual([p.organizationId]);
    await expect(startThread(stranger, { organizationId: p.organizationId, appointmentId, subject: 'Question', body: 'Not my appointment' })).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(startThread(patient, { organizationId: other.organizationId, appointmentId, subject: 'Wrong clinic', body: 'Appointment elsewhere' })).rejects.toMatchObject({ code: 'NOT_FOUND' });

    const { threadId } = await startThread(patient, { organizationId: p.organizationId, appointmentId, subject: 'Parking', body: 'Is there parking near the clinic?' });
    await expect(startThread(patient, { organizationId: p.organizationId, appointmentId, subject: 'Parking again', body: 'Asking twice' })).rejects.toMatchObject({ code: 'CONFLICT' });
    expect(await testDb().inAppNotification.count({ where: { userId: p.ownerId, notificationId: 'TL-NOTIF-NEW-MESSAGE-001' } })).toBe(1);
    const note = await testDb().inAppNotification.findFirstOrThrow({ where: { userId: p.ownerId, notificationId: 'TL-NOTIF-NEW-MESSAGE-001' } });
    expect(note.body).not.toContain('parking');

    // The practice sees it; nobody else does.
    const [practiceView] = await listPracticeThreads(p.staff, p.organizationId);
    expect(practiceView).toMatchObject({ id: threadId, unread: true });
    await expect(listPracticeThreads(other.admin, p.organizationId)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(getThread(stranger, threadId)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(getThread(other.admin, threadId)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(postMessage(other.admin, threadId, { body: 'Intruding' })).rejects.toMatchObject({ code: 'NOT_FOUND' });

    const opened = await getThread(p.staff, threadId);
    expect(opened).toMatchObject({ side: 'PRACTICE', canReply: true });
    expect((await listPracticeThreads(p.staff, p.organizationId))[0]!.unread).toBe(false);
    await postMessage(p.staff, threadId, { body: 'Yes — free parking behind the building.' });
    expect(await testDb().inAppNotification.count({ where: { userId: patient.userId, notificationId: 'TL-NOTIF-NEW-MESSAGE-001' } })).toBe(1);
    expect((await listPatientThreads(patient))[0]).toMatchObject({ unread: true, last: { side: 'PRACTICE' } });
    await getThread(patient, threadId);
    expect((await listPatientThreads(patient))[0]!.unread).toBe(false);

    // Closed: no more messages; a new conversation may start.
    await closeThread(patient, threadId);
    await expect(closeThread(p.admin, threadId)).rejects.toMatchObject({ code: 'PRECONDITION_FAILED' });
    await expect(postMessage(p.staff, threadId, { body: 'One more thing' })).rejects.toMatchObject({ code: 'PRECONDITION_FAILED' });
    await startThread(patient, { organizationId: p.organizationId, appointmentId, subject: 'Parking, again', body: 'Which gate is it?' });
  });

  it('limits a person to 30 messages a day', async () => {
    const p = await practice('msg2');
    const patient = principal(await user('patient'), ['patient']);
    await book(p, patient);
    const now = new Date();
    const { threadId } = await startThread(patient, { organizationId: p.organizationId, subject: 'Many questions', body: 'First question' }, { now });
    for (let i = 0; i < 29; i += 1) await postMessage(patient, threadId, { body: `Follow-up ${i}` }, { now });
    await expect(postMessage(patient, threadId, { body: 'One too many' }, { now })).rejects.toMatchObject({ code: 'RATE_LIMITED' });
    await postMessage(patient, threadId, { body: 'Next day' }, { now: new Date(now.getTime() + DAY + 1000) });
  });

  it('keeps internal notes from the requester, and moves tickets through their statuses', async () => {
    const requester = principal(await user('requester'), ['patient']);
    const outsider = principal(await user('outsider'), ['patient']);
    const agentId = await user('agent');
    await testDb().roleAssignment.create({ data: { id: `ra_${Math.random().toString(36).slice(2)}`, userId: agentId, roleKey: 'support_agent' } });
    const agent = principal(agentId, ['support_agent']);
    const p = await practice('sup1');

    await expect(openTicket(requester, { category: 'BILLING', subject: 'Charged twice', body: 'I think a lead was charged twice.', organizationId: p.organizationId })).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
    const { ticketId } = await openTicket(requester, { category: 'BOOKING', subject: 'Cannot reschedule', body: 'The reschedule button does nothing for my appointment.' });
    await expect(openTicket(requester, { category: 'SNACKS' as 'OTHER', subject: 'Hungry', body: 'Where is the cafeteria please?' })).rejects.toThrow();
    const byPractice = await openTicket(p.admin, { category: 'BILLING', subject: 'Wallet question', body: 'How are refunds for disputed leads shown?', organizationId: p.organizationId });
    expect((await getTicket(agent, byPractice.ticketId)).ticket.organization?.name).toContain('sup1');

    await expect(supportQueue(requester)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect((await supportQueue(agent)).map((t) => t.id).sort()).toEqual([ticketId, byPractice.ticketId].sort());
    await expect(getTicket(outsider, ticketId)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(replyToTicket(outsider, ticketId, { body: 'Let me in please.' })).rejects.toMatchObject({ code: 'NOT_FOUND' });

    await replyToTicket(agent, ticketId, { body: 'Reproduced — the booking was locked by a clinic change.', internal: true });
    expect((await testDb().supportTicket.findUniqueOrThrow({ where: { id: ticketId } })).status).toBe('OPEN');
    await expect(replyToTicket(requester, ticketId, { body: 'Trying to leave a note.', internal: true })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await replyToTicket(agent, ticketId, { body: 'Could you try again now? We cleared the lock.' });
    expect((await testDb().supportTicket.findUniqueOrThrow({ where: { id: ticketId } })).status).toBe('WAITING_ON_USER');
    expect(await testDb().inAppNotification.count({ where: { userId: requester.userId, notificationId: 'TL-NOTIF-SUPPORT-UPDATE-001' } })).toBe(1);
    const mine = await getTicket(requester, ticketId);
    expect(mine.ticket.messages.map((m) => m.fromStaff)).toEqual([false, true]);
    expect(mine.ticket.messages.some((m) => m.internal)).toBe(false);
    expect((await getTicket(agent, ticketId)).ticket.messages).toHaveLength(3);

    await setTicketStatus(agent, ticketId, { status: 'RESOLVED' });
    expect(await testDb().inAppNotification.count({ where: { userId: requester.userId, notificationId: 'TL-NOTIF-SUPPORT-UPDATE-001' } })).toBe(2);
    await replyToTicket(requester, ticketId, { body: 'Still not working for me, sorry.' });
    expect(await testDb().supportTicket.findUniqueOrThrow({ where: { id: ticketId } })).toMatchObject({ status: 'OPEN', resolvedAt: null });
    await expect(setTicketStatus(requester, ticketId, { status: 'RESOLVED' })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await setTicketStatus(requester, ticketId, { status: 'CLOSED' });
    await expect(replyToTicket(agent, ticketId, { body: 'After closing we answer anyway.' })).rejects.toMatchObject({ code: 'PRECONDITION_FAILED' });

    await expect(assignTicket(requester, byPractice.ticketId, { assignedToUserId: agentId })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(assignTicket(agent, byPractice.ticketId, { assignedToUserId: outsider.userId })).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
    await assignTicket(agent, byPractice.ticketId, { assignedToUserId: agentId });
    expect((await supportQueue(agent, { mine: true })).map((t) => t.id)).toEqual([byPractice.ticketId]);
    expect((await supportAgents()).map((a) => a.userId)).toContain(agentId);
    expect(await myTickets(requester)).toHaveLength(1);
  });

  it('limits a person to 5 new tickets a day', async () => {
    const requester = principal(await user('busy'), ['patient']);
    for (let i = 0; i < 5; i += 1) await openTicket(requester, { category: 'OTHER', subject: `Question ${i + 1}`, body: 'A question about Toothlogy that needs a person.' });
    await expect(openTicket(requester, { category: 'OTHER', subject: 'Question 6', body: 'One question too many for today.' })).rejects.toMatchObject({ code: 'RATE_LIMITED' });
  });
});

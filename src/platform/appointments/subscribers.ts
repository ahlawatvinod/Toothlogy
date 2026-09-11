/**
 * Durable reactions to appointment, waitlist, lead and billing events.
 *
 * Registered from the platform subscriber index. Handler keys are permanent
 * receipt identities: renaming one would re-run it for every past event.
 *
 * Each handler is safe to run again: notifications are recorded against the
 * event id, lead settlement is idempotent, and a waitlist offer can only ever
 * create one hold per slot.
 */

import { db } from '../db/client';
import { formatDateTime } from '../i18n';
import { notifyOrganizationAdmins, notifyUser } from '../notifications';
import { formatMoney } from '../money';
import { registerDurableHandler } from '../events/outbox';

interface AppointmentPayload {
  appointmentId: string;
  patientUserId: string;
  organizationId: string;
  practiceId: string;
  dentistProfileId: string;
  locationId: string;
  startsAt: string;
  endsAt: string;
  status: string;
  actor?: 'PATIENT' | 'PRACTICE' | 'SYSTEM';
  reason?: string | null;
  previousStartsAt?: string;
  previousEndsAt?: string;
}

async function details(appointmentId: string) {
  return db().appointment.findUnique({
    where: { id: appointmentId },
    include: {
      patient: { select: { displayName: true, locale: true, timezone: true } },
      dentistProfile: { select: { userId: true, slug: true, user: { select: { displayName: true } } } },
      location: { select: { name: true, address: { select: { lines: true, locality: true } } } },
    },
  });
}

type Details = NonNullable<Awaited<ReturnType<typeof details>>>;

function when(a: { timezone: string }, at: Date, locale = 'en-IN'): string {
  return formatDateTime(at, locale, a.timezone);
}

function baseData(a: Details) {
  return {
    when: when(a, a.startsAt),
    dentist: a.dentistProfile.user.displayName ?? 'your dentist',
    location: a.location.name,
    address: [a.location.address?.lines.join(', '), a.location.address?.locality].filter(Boolean).join(', '),
    patient: a.patient.displayName ?? 'A patient',
  };
}

/** The dentist and the organization's administrators, each told once. */
async function notifyPractice(a: Details, notificationId: string, data: Record<string, string>, event: { id: string }) {
  const admins = await db().organizationMember.findMany({
    where: { organizationId: a.organizationId, roleKey: 'clinic_admin', leftAt: null },
    select: { userId: true },
  });
  const recipients = new Set([a.dentistProfile.userId, ...admins.map((m) => m.userId)]);
  for (const userId of recipients) {
    await notifyUser({ userId, notificationId, data, linkUrl: `/account/practice/appointments/${a.id}`, sourceEventId: event.id });
  }
}

async function freeSlot(payload: AppointmentPayload, startsAt: string, endsAt: string) {
  const { offerFreedSlot } = await import('./waitlist');
  await offerFreedSlot({
    practiceId: payload.practiceId,
    dentistProfileId: payload.dentistProfileId,
    locationId: payload.locationId,
    startsAt: new Date(startsAt),
    endsAt: new Date(endsAt),
  });
}

async function leadOutcome(appointmentId: string, outcome: 'CONFIRMED' | 'COMPLETED' | 'CANCELLED' | 'REJECTED' | 'EXPIRED' | 'NO_SHOW') {
  const { onAppointmentOutcome } = await import('../leads/service');
  await onAppointmentOutcome(appointmentId, outcome);
}

async function syncVideo(appointmentId: string, action: 'provision' | 'cancel') {
  const video = await import('../video/service');
  // With no provider this reports NOT_CONFIGURED and writes nothing; there is
  // no meeting to create and no link to show.
  if (action === 'provision') await video.provisionVideoMeeting(appointmentId);
  else await video.cancelVideoMeeting(appointmentId);
}

function money(minor: string | undefined, currency: string): string {
  return formatMoney({ amountMinor: BigInt(minor ?? '0'), currency }, 'en-IN');
}

export function registerAppointmentSubscribers(): void {
  registerDurableHandler('APPOINTMENT_CREATED', 'notify.practice.appointment-created', async (event) => {
    const p = event.payload as unknown as AppointmentPayload & { mode?: string };
    const a = await details(p.appointmentId);
    if (!a) return;
    await notifyPractice(a, 'TL-NOTIF-APPOINTMENT-CREATED-001', { ...baseData(a), status: a.status === 'REQUESTED' ? 'request — please respond' : 'booking' }, event);
  });

  // A request is not a booking: the patient is told it was sent, and when the
  // practice must answer by — not that it is confirmed.
  registerDurableHandler('APPOINTMENT_CREATED', 'notify.patient.appointment-requested', async (event) => {
    const p = event.payload as unknown as AppointmentPayload & { mode?: string };
    const a = await details(p.appointmentId);
    if (!a || p.mode !== 'REQUEST') return;
    await notifyUser({
      userId: a.patientUserId,
      notificationId: 'TL-NOTIF-APPOINTMENT-REQUESTED-001',
      data: { ...baseData(a), respondBy: a.expiresAt ? when(a, a.expiresAt) : 'soon' },
      linkUrl: `/account/appointments/${a.id}`,
      sourceEventId: event.id,
    });
  });

  registerDurableHandler('APPOINTMENT_CHECKED_IN', 'notify.other-side.appointment-checked-in', async (event) => {
    const p = event.payload as unknown as AppointmentPayload;
    const a = await details(p.appointmentId);
    if (!a) return;
    if (p.actor === 'PATIENT') await notifyPractice(a, 'TL-NOTIF-APPOINTMENT-CHECKED-IN-001', { ...baseData(a), who: `${baseData(a).patient} has arrived` }, event);
    else await notifyUser({ userId: a.patientUserId, notificationId: 'TL-NOTIF-APPOINTMENT-CHECKED-IN-001', data: { ...baseData(a), who: 'You are checked in' }, linkUrl: `/account/appointments/${a.id}`, sourceEventId: event.id });
  });

  // The video room follows the appointment.
  registerDurableHandler('APPOINTMENT_CONFIRMED', 'video.provision.confirmed', async (event) => syncVideo((event.payload as unknown as AppointmentPayload).appointmentId, 'provision'));
  registerDurableHandler('APPOINTMENT_RESCHEDULED', 'video.sync.rescheduled', async (event) => {
    const p = event.payload as unknown as AppointmentPayload;
    await syncVideo(p.appointmentId, p.status === 'CONFIRMED' ? 'provision' : 'cancel');
  });
  for (const ended of ['APPOINTMENT_CANCELLED', 'APPOINTMENT_REJECTED', 'APPOINTMENT_EXPIRED', 'APPOINTMENT_NO_SHOW']) {
    registerDurableHandler(ended, `video.cancel.${ended.toLowerCase().replace('appointment_', '')}`, async (event) =>
      syncVideo((event.payload as unknown as AppointmentPayload).appointmentId, 'cancel'),
    );
  }

  registerDurableHandler('APPOINTMENT_CONFIRMED', 'notify.patient.appointment-confirmed', async (event) => {
    const p = event.payload as unknown as AppointmentPayload;
    const a = await details(p.appointmentId);
    if (!a) return;
    await notifyUser({ userId: a.patientUserId, notificationId: 'TL-NOTIF-APPOINTMENT-CONFIRMED-001', data: baseData(a), linkUrl: `/account/appointments/${a.id}`, sourceEventId: event.id });
  });

  registerDurableHandler('APPOINTMENT_CONFIRMED', 'leads.settle.appointment-confirmed', async (event) => {
    await leadOutcome((event.payload as unknown as AppointmentPayload).appointmentId, 'CONFIRMED');
  });

  registerDurableHandler('APPOINTMENT_REJECTED', 'notify.patient.appointment-rejected', async (event) => {
    const p = event.payload as unknown as AppointmentPayload;
    const a = await details(p.appointmentId);
    if (!a) return;
    await notifyUser({ userId: a.patientUserId, notificationId: 'TL-NOTIF-APPOINTMENT-REJECTED-001', data: { ...baseData(a), reason: p.reason ?? '' }, linkUrl: `/dentists/${a.dentistProfile.slug}`, sourceEventId: event.id });
  });

  registerDurableHandler('APPOINTMENT_EXPIRED', 'notify.patient.appointment-expired', async (event) => {
    const p = event.payload as unknown as AppointmentPayload;
    const a = await details(p.appointmentId);
    if (!a) return;
    // A lapsed waitlist hold needs no apology; a lapsed request does.
    if (a.waitlistEntryId) return;
    await notifyUser({ userId: a.patientUserId, notificationId: 'TL-NOTIF-APPOINTMENT-REJECTED-001', data: { ...baseData(a), reason: 'The practice did not respond in time.' }, linkUrl: `/dentists/${a.dentistProfile.slug}`, sourceEventId: event.id });
  });

  registerDurableHandler('APPOINTMENT_CANCELLED', 'notify.other-side.appointment-cancelled', async (event) => {
    const p = event.payload as unknown as AppointmentPayload;
    const a = await details(p.appointmentId);
    if (!a) return;
    const data = { ...baseData(a), cancelledBy: p.actor === 'PATIENT' ? 'the patient' : p.actor === 'PRACTICE' ? 'the practice' : 'Toothlogy', reason: p.reason ?? '' };
    if (p.actor === 'PATIENT') await notifyPractice(a, 'TL-NOTIF-APPOINTMENT-CANCELLED-001', data, event);
    else await notifyUser({ userId: a.patientUserId, notificationId: 'TL-NOTIF-APPOINTMENT-CANCELLED-001', data, linkUrl: `/account/appointments/${a.id}`, sourceEventId: event.id });
  });

  registerDurableHandler('APPOINTMENT_RESCHEDULED', 'notify.both.appointment-rescheduled', async (event) => {
    const p = event.payload as unknown as AppointmentPayload;
    const a = await details(p.appointmentId);
    if (!a) return;
    const data = { ...baseData(a), oldWhen: p.previousStartsAt ? when(a, new Date(p.previousStartsAt)) : '' };
    if (p.actor === 'PATIENT') await notifyPractice(a, 'TL-NOTIF-APPOINTMENT-RESCHEDULED-001', data, event);
    else await notifyUser({ userId: a.patientUserId, notificationId: 'TL-NOTIF-APPOINTMENT-RESCHEDULED-001', data, linkUrl: `/account/appointments/${a.id}`, sourceEventId: event.id });
  });

  registerDurableHandler('APPOINTMENT_COMPLETED', 'notify.patient.appointment-completed', async (event) => {
    const p = event.payload as unknown as AppointmentPayload;
    const a = await details(p.appointmentId);
    if (!a) return;
    const followUp = a.followUpDueAt ? `${baseData(a).dentist} recommends a follow-up around ${formatDateTime(a.followUpDueAt, 'en-IN', a.timezone, { dateStyle: 'medium' })}.` : '';
    await notifyUser({ userId: a.patientUserId, notificationId: 'TL-NOTIF-APPOINTMENT-COMPLETED-001', data: { ...baseData(a), followUp }, linkUrl: `/account/appointments/${a.id}`, sourceEventId: event.id });
  });

  // Lead bookkeeping follows every outcome.
  registerDurableHandler('APPOINTMENT_COMPLETED', 'leads.appointment-completed', async (event) => leadOutcome((event.payload as unknown as AppointmentPayload).appointmentId, 'COMPLETED'));
  registerDurableHandler('APPOINTMENT_CANCELLED', 'leads.appointment-cancelled', async (event) => leadOutcome((event.payload as unknown as AppointmentPayload).appointmentId, 'CANCELLED'));
  registerDurableHandler('APPOINTMENT_REJECTED', 'leads.appointment-rejected', async (event) => leadOutcome((event.payload as unknown as AppointmentPayload).appointmentId, 'REJECTED'));
  registerDurableHandler('APPOINTMENT_EXPIRED', 'leads.appointment-expired', async (event) => leadOutcome((event.payload as unknown as AppointmentPayload).appointmentId, 'EXPIRED'));
  registerDurableHandler('APPOINTMENT_NO_SHOW', 'leads.appointment-no-show', async (event) => leadOutcome((event.payload as unknown as AppointmentPayload).appointmentId, 'NO_SHOW'));

  // A freed slot goes to the waitlist.
  registerDurableHandler('APPOINTMENT_CANCELLED', 'waitlist.offer.cancelled', async (event) => {
    const p = event.payload as unknown as AppointmentPayload;
    await freeSlot(p, p.startsAt, p.endsAt);
  });
  registerDurableHandler('APPOINTMENT_REJECTED', 'waitlist.offer.rejected', async (event) => {
    const p = event.payload as unknown as AppointmentPayload;
    await freeSlot(p, p.startsAt, p.endsAt);
  });
  registerDurableHandler('APPOINTMENT_EXPIRED', 'waitlist.offer.expired', async (event) => {
    const p = event.payload as unknown as AppointmentPayload;
    await freeSlot(p, p.startsAt, p.endsAt);
  });
  registerDurableHandler('APPOINTMENT_RESCHEDULED', 'waitlist.offer.rescheduled', async (event) => {
    const p = event.payload as unknown as AppointmentPayload;
    if (p.previousStartsAt && p.previousEndsAt) await freeSlot(p, p.previousStartsAt, p.previousEndsAt);
  });

  registerDurableHandler('WAITLIST_SLOT_OFFERED', 'notify.patient.waitlist-offer', async (event) => {
    const p = event.payload as unknown as { appointmentId: string; patientUserId: string };
    const a = await details(p.appointmentId);
    if (!a) return;
    await notifyUser({ userId: p.patientUserId, notificationId: 'TL-NOTIF-WAITLIST-OFFER-001', data: baseData(a), linkUrl: `/account/appointments/${a.id}`, sourceEventId: event.id });
  });

  // --- Leads and billing -------------------------------------------------------

  registerDurableHandler('LEAD_CREATED', 'notify.practice.lead-offer', async (event) => {
    const p = event.payload as unknown as { leadId: string };
    const lead = await db().lead.findUnique({
      where: { id: p.leadId },
      include: { serviceOffering: { select: { name: true } }, location: { select: { name: true, address: { select: { locality: true } } } }, dentistProfile: { select: { userId: true } } },
    });
    if (!lead) return;
    const price = lead.priceMinor !== null && lead.currency ? formatMoney({ amountMinor: lead.priceMinor + (lead.taxMinor ?? BigInt(0)), currency: lead.currency }, 'en-IN') : 'the qualified-lead price';
    const data = { area: lead.location.address?.locality ?? lead.location.name, treatment: lead.serviceOffering?.name ?? 'a consultation', price };
    const admins = await db().organizationMember.findMany({ where: { organizationId: lead.organizationId, roleKey: 'clinic_admin', leftAt: null }, select: { userId: true } });
    const recipients = new Set([...(lead.dentistProfile ? [lead.dentistProfile.userId] : []), ...admins.map((m) => m.userId)]);
    for (const userId of recipients) {
      await notifyUser({ userId, notificationId: 'TL-NOTIF-LEAD-OFFER-001', data, linkUrl: `/account/practice/leads`, sourceEventId: event.id });
    }
  });

  registerDurableHandler('LEAD_ACCEPTED', 'notify.patient.lead-accepted', async (event) => {
    const p = event.payload as unknown as { leadId: string; patientUserId: string; organizationId: string };
    const organization = await db().organization.findUnique({ where: { id: p.organizationId }, select: { name: true } });
    await notifyUser({ userId: p.patientUserId, notificationId: 'TL-NOTIF-LEAD-ACCEPTED-001', data: { practice: organization?.name ?? 'The practice' }, sourceEventId: event.id });
  });

  registerDurableHandler('LEAD_REFUNDED', 'notify.org-admins.lead-refunded', async (event) => {
    const p = event.payload as unknown as { organizationId: string; amountMinor: string; leadId: string };
    const wallet = await db().wallet.findUnique({ where: { organizationId: p.organizationId }, select: { currency: true } });
    const amount = wallet ? formatMoney({ amountMinor: BigInt(p.amountMinor), currency: wallet.currency }, 'en-IN') : p.amountMinor;
    await notifyOrganizationAdmins({ organizationId: p.organizationId, notificationId: 'TL-NOTIF-BILLING-UPDATE-001', data: { summary: `A lead charge of ${amount} was refunded to your wallet.` }, linkUrl: `/account/organizations/${p.organizationId}/billing`, sourceEventId: event.id });
  });

  registerDurableHandler('WALLET_CREDITED', 'notify.org-admins.wallet-credited', async (event) => {
    const p = event.payload as unknown as { organizationId: string; amountMinor: string; currency: string; kind?: string; balanceAfterMinor?: string };
    const amount = money(p.amountMinor, p.currency);
    const balance = p.balanceAfterMinor ? ` Your balance is now ${money(p.balanceAfterMinor, p.currency)}.` : '';
    const summary = p.kind === 'ADJUSTMENT' ? `${amount} was credited to your lead wallet by Toothlogy.${balance}` : `Your recharge of ${amount} was received and added to your lead wallet.${balance}`;
    await notifyOrganizationAdmins({ organizationId: p.organizationId, notificationId: 'TL-NOTIF-BILLING-UPDATE-001', data: { summary }, linkUrl: `/account/organizations/${p.organizationId}/billing`, sourceEventId: event.id });
  });

  // Every billing decision on a qualified lead: free, charged (a wallet debit),
  // or waiting for funds.
  registerDurableHandler('LEAD_BILLED', 'notify.org-admins.lead-billed', async (event) => {
    const p = event.payload as unknown as {
      organizationId: string;
      outcome: 'FREE' | 'CHARGED' | 'PENDING_FUNDS';
      ordinal: number;
      freeLeadAllowance?: number;
      netMinor?: string;
      taxMinor?: string;
      grossMinor?: string;
      balanceAfterMinor?: string;
      currency: string;
    };
    const summary =
      p.outcome === 'FREE'
        ? `Qualified lead ${p.ordinal} was free: it is within your first ${p.freeLeadAllowance ?? 0} free leads.`
        : p.outcome === 'CHARGED'
          ? `Qualified lead ${p.ordinal} was charged ${money(p.grossMinor, p.currency)} (${money(p.netMinor, p.currency)} + GST ${money(p.taxMinor, p.currency)}). Wallet balance: ${money(p.balanceAfterMinor, p.currency)}.`
          : `Qualified lead ${p.ordinal} (${money(p.grossMinor, p.currency)}) is waiting for funds: your wallet cannot cover it. Recharge to release it.`;
    await notifyOrganizationAdmins({ organizationId: p.organizationId, notificationId: 'TL-NOTIF-LEAD-BILLED-001', data: { summary }, linkUrl: '/account/practice/leads', sourceEventId: event.id });
  });

  registerDurableHandler('SPONSORED_CAMPAIGN_ACTIVATED', 'notify.org-admins.campaign-activated', async (event) => {
    const p = event.payload as unknown as { campaignId: string; organizationId: string; heldMinor: string; currency: string };
    const campaign = await db().sponsoredCampaign.findUnique({ where: { id: p.campaignId }, select: { name: true } });
    await notifyOrganizationAdmins({
      organizationId: p.organizationId,
      notificationId: 'TL-NOTIF-CAMPAIGN-UPDATE-001',
      data: { summary: `Prime campaign “${campaign?.name ?? 'campaign'}” is active. ${money(p.heldMinor, p.currency)} is held from your wallet for it; whatever is not spent comes back when it ends.` },
      linkUrl: `/account/organizations/${p.organizationId}/campaigns/${p.campaignId}`,
      sourceEventId: event.id,
    });
  });

  registerDurableHandler('SPONSORED_CAMPAIGN_CLOSED', 'notify.org-admins.campaign-closed', async (event) => {
    const p = event.payload as unknown as { campaignId: string; organizationId: string; status: string; spentMinor: string; refundedMinor: string; currency: string };
    const campaign = await db().sponsoredCampaign.findUnique({ where: { id: p.campaignId }, select: { name: true } });
    const how = p.status === 'CANCELLED' ? 'was cancelled' : p.status === 'EXHAUSTED' ? 'has spent its budget' : 'has ended';
    await notifyOrganizationAdmins({
      organizationId: p.organizationId,
      notificationId: 'TL-NOTIF-CAMPAIGN-UPDATE-001',
      data: { summary: `Prime campaign “${campaign?.name ?? 'campaign'}” ${how}. Spent ${money(p.spentMinor, p.currency)}; ${money(p.refundedMinor, p.currency)} returned to your wallet.` },
      linkUrl: `/account/organizations/${p.organizationId}/campaigns/${p.campaignId}`,
      sourceEventId: event.id,
    });
  });

  registerDurableHandler('WALLET_LOW_BALANCE', 'notify.org-admins.wallet-low', async (event) => {
    const p = event.payload as unknown as { organizationId: string; balanceMinor: string; leadsCovered: number; currency: string };
    await notifyOrganizationAdmins({
      organizationId: p.organizationId,
      notificationId: 'TL-NOTIF-WALLET-LOW-BALANCE-001',
      data: { balance: money(p.balanceMinor, p.currency), leads: String(p.leadsCovered) },
      linkUrl: `/account/organizations/${p.organizationId}/billing`,
      sourceEventId: event.id,
    });
  });
}

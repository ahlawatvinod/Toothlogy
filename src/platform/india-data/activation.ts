/**
 * TOOTHLOGY INDIA DATA — activating a pre-made account
 *
 * A dentist whose profile was created from public records activates it — it
 * is never re-registered as a second account — by proving BOTH contacts on
 * it: a link to the email address and a one-time code to the mobile number.
 *
 * - Starting always answers the same way, matched or not, so the endpoint
 *   cannot be used to discover which dentists have pre-made profiles.
 * - The code is checked before the email link is spent, so a mistyped code
 *   does not force a new email; the code has its own attempt budget.
 * - Activation is once only (a conditional status update), sets a password,
 *   marks the email verified (the phone is marked by the code), and records
 *   the claim on the extracted record. The extracted original is untouched.
 *
 * Delivery goes through the notification ports. With no email or SMS
 * provider configured, nothing is delivered — and nothing claims it was.
 */

import { z } from 'zod';
import { errors, isAppError } from '../kernel/errors';
import { newId } from '../kernel/ids';
import { db, transaction } from '../db/client';
import { recordAuditEvent } from '../audit';
import { absoluteUrl, notifyUser } from '../notifications';
import { issueToken, peekToken, redeemToken } from '../auth/tokens';
import { checkPasswordPolicy, hashPassword, MAX_PASSWORD_LENGTH } from '../auth/password';
import { confirmPhoneVerification, requestPhoneVerification } from '../auth/service';
import { normalizeEmail, normalizeIndianMobile } from './normalize';

export const START_MESSAGE =
  'If a Toothlogy profile matches this email address and mobile number, we have sent a link to the email and a code to the mobile. You need both to activate it.';

export const startActivationSchema = z.object({
  email: z.string().trim().max(254),
  phone: z.string().trim().max(24),
});

export async function startActivation(raw: z.input<typeof startActivationSchema>, context: { ipAddress?: string | null; requestId?: string } = {}) {
  const input = startActivationSchema.parse(raw);
  const email = normalizeEmail(input.email);
  const phone = normalizeIndianMobile(input.phone);
  if (!email || !phone) throw errors.validation('Enter the email address and the mobile number on your profile.');

  const user = await db().user.findFirst({ where: { email, phone, status: 'PENDING_ACTIVATION', deletedAt: null }, select: { id: true } });
  if (user) {
    const issued = await issueToken(user.id, 'EMAIL_VERIFICATION', email, { ipAddress: context.ipAddress });
    await notifyUser({
      userId: user.id,
      notificationId: 'TL-NOTIF-ACCOUNT-ACTIVATION-001',
      overrideContact: { email },
      transientData: { link: absoluteUrl(`/activate?token=${encodeURIComponent(issued.token)}`) },
      requestId: context.requestId,
    });
    try {
      await requestPhoneVerification(user.id, phone, { requestId: context.requestId });
    } catch (error) {
      // A resend inside the cooldown is not an error the caller may see: it
      // would tell them this email and number belong to a real profile.
      if (!isAppError(error) || error.code !== 'RATE_LIMITED') throw error;
    }
    await recordAuditEvent({ action: 'PREMADE_ACTIVATION_STARTED', actor: user.id, subject: user.id, outcome: 'success', requestId: context.requestId });
  }
  return { message: START_MESSAGE };
}

export const completeActivationSchema = z.object({
  token: z.string().min(16).max(256),
  code: z.string().trim().regex(/^\d{6}$/, 'Enter the 6-digit code.'),
  password: z.string().max(MAX_PASSWORD_LENGTH),
  acceptedTerms: z.literal(true, { error: 'Accept the terms of use to continue.' }),
});

export async function completeActivation(raw: z.input<typeof completeActivationSchema>, context: { requestId?: string } = {}) {
  const input = completeActivationSchema.parse(raw);
  const policy = checkPasswordPolicy(input.password);
  if (!policy.valid) throw errors.validation('That password cannot be used.', { issues: policy.problems.map((message) => ({ field: 'password', message })) });

  const invalid = () => errors.validation('This activation link is invalid, used or expired. Start activation again.', { field: 'token' });
  const peek = await peekToken(input.token, 'EMAIL_VERIFICATION');
  if (!peek) throw invalid();
  const user = await db().user.findUnique({ where: { id: peek.userId }, select: { id: true, email: true, status: true } });
  if (!user || user.status !== 'PENDING_ACTIVATION' || user.email !== peek.destination) throw invalid();

  // The mobile first: a wrong code costs an attempt, not the email link.
  await confirmPhoneVerification(user.id, input.code, { requestId: context.requestId });
  const redeemed = await redeemToken(input.token, 'EMAIL_VERIFICATION');
  if (!redeemed.ok || redeemed.userId !== user.id) throw invalid();

  const passwordHash = await hashPassword(input.password);
  const now = new Date();
  await transaction(async (tx) => {
    const claim = await tx.user.updateMany({ where: { id: user.id, status: 'PENDING_ACTIVATION' }, data: { status: 'ACTIVE', emailVerifiedAt: now } });
    if (claim.count === 0) throw errors.conflict('This account was activated at the same moment.');
    await tx.credential.create({ data: { id: newId('credential'), userId: user.id, type: 'PASSWORD', secretHash: passwordHash } });
    await tx.extractedRecord.updateMany({ where: { premadeUserId: user.id }, data: { status: 'ACTIVATED', activatedAt: now, claimedAt: now } });
  });
  await recordAuditEvent({ action: 'PREMADE_ACCOUNT_ACTIVATED', actor: user.id, subject: user.id, outcome: 'success', requestId: context.requestId, detail: { acceptedTerms: true } });
  return { activated: true as const };
}

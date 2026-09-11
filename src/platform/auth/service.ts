/**
 * TOOTHLOGY AUTHENTICATION SERVICE
 *
 * Registration, login, verification, password reset and account deletion.
 *
 * TWO PRINCIPLES SHAPE EVERY FUNCTION HERE
 *
 * **Never reveal whether an account exists.** Registration, login and password
 * reset all return the same shape whether or not the identifier is registered.
 * A product that says "no account with that email" hands an attacker a free
 * membership oracle: enumerate a breach corpus against it and you learn who has
 * a Toothlogy account — which, for a *dental* platform, is health-adjacent
 * information about a real person.
 *
 * **Every write that spans tables is a transaction.** Creating a user writes a
 * user, a credential, a role assignment, notification preferences and an
 * outbox event. Four of five succeeding produces an account that can never log
 * in, with nothing in the logs to say why.
 */

import { z } from 'zod';
import { newId } from '../kernel/ids';
import { errors } from '../kernel/errors';
import { db, isUniqueConstraintError, transaction } from '../db/client';
import { recordAuditEvent } from '../audit';
import { logger } from '../observability/logger';
import { DEFAULT_COUNTRY, DEFAULT_LOCALE, DEFAULT_TIMEZONE } from '@/registry/globalization';
import { absoluteUrl, notifyUser } from '../notifications';
import { derivedSecret } from '../security/crypto';
import { checkPasswordPolicy, hashPassword, needsRehash, verifyPassword } from './password';
import { createSession, revokeAllSessions, type CreatedSession } from './session';
import { issueToken, redeemToken } from './tokens';
import { hasMfa, issueMfaChallenge } from './mfa';
import { assessLogin, recordSecurityEvent } from './security-events';
import { OTP_TTL_SECONDS, canResendOtp, createOtpChallenge, verifyOtpCode } from './otp';

// ---------------------------------------------------------------------------
// Input contracts
// ---------------------------------------------------------------------------

/**
 * Email normalisation: trim and lowercase.
 *
 * Deliberately does NOT strip dots or `+tags` from Gmail addresses. Doing so is
 * a common "clever" touch that breaks legitimate use — people really do use
 * `name+dentist@gmail.com` to filter mail — and it is not our place to decide
 * two addresses are the same person.
 */
export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .email('Enter a valid email address.')
  .max(320, 'Email address is too long.');

/**
 * E.164 phone. Stored normalised so lookup is exact.
 *
 * Validation is intentionally loose on national format: per-country rules live
 * in the phone tool, and a global regex that tries to encode every country's
 * numbering plan rejects valid numbers somewhere.
 */
export const phoneSchema = z
  .string()
  .trim()
  .regex(/^\+[1-9]\d{6,14}$/, 'Enter a phone number in international format, e.g. +919876543210.');

export const registerSchema = z
  .object({
    email: emailSchema.optional(),
    phone: phoneSchema.optional(),
    password: z.string().min(1, 'Enter a password.'),
    displayName: z.string().trim().min(1, 'Enter your name.').max(120),
    /** Role requested at signup. Only self-assignable roles are honoured. */
    role: z.enum(['patient', 'dentist', 'student', 'supplier']).default('patient'),
    locale: z.string().optional(),
    countryCode: z.string().length(2).optional(),
    timezone: z.string().optional(),
    acceptedTerms: z.literal(true, {
      message: 'You must accept the terms to continue.',
    }),
  })
  // At least one contact method. Email-only would exclude the Indian market,
  // where phone-first signup is the norm; phone-only would exclude everyone
  // without SMS.
  .refine((data) => Boolean(data.email ?? data.phone), {
    message: 'Provide an email address or a phone number.',
    path: ['email'],
  });

export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  identifier: z.string().trim().min(1, 'Enter your email or phone number.'),
  password: z.string().min(1, 'Enter your password.'),
});

export type LoginInput = z.infer<typeof loginSchema>;

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

export interface RegistrationResult {
  readonly userId: string;
  readonly session: CreatedSession;
  /** The token to send. Never logged, never returned by an API. */
  readonly verificationToken: string | null;
  readonly verificationDestination: string | null;
}

/**
 * Register a new account.
 *
 * Roles requested at signup are restricted to the four self-assignable ones.
 * A registration form that accepted an arbitrary role string would be a
 * privilege-escalation endpoint: `role: "platform_admin"` in a request body.
 */
const SELF_ASSIGNABLE_ROLES = new Set(['patient', 'dentist', 'student', 'supplier']);

export async function register(
  input: RegisterInput,
  context: { ipAddress?: string | null; userAgent?: string | null; requestId?: string } = {},
): Promise<RegistrationResult> {
  const policy = checkPasswordPolicy(input.password);
  if (!policy.valid) {
    throw errors.validation('That password cannot be used.', {
      issues: policy.problems.map((message) => ({ field: 'password', message })),
    });
  }

  if (!SELF_ASSIGNABLE_ROLES.has(input.role)) {
    throw errors.validation('That account type cannot be selected at signup.', {
      field: 'role',
    });
  }

  const passwordHash = await hashPassword(input.password);
  const userId = newId('user');

  try {
    await transaction(async (tx) => {
      await tx.user.create({
        data: {
          id: userId,
          email: input.email ?? null,
          phone: input.phone ?? null,
          displayName: input.displayName,
          locale: input.locale ?? DEFAULT_LOCALE,
          countryCode: input.countryCode ?? DEFAULT_COUNTRY,
          timezone: input.timezone ?? DEFAULT_TIMEZONE,
          credentials: {
            create: {
              id: newId('credential'),
              type: 'PASSWORD',
              secretHash: passwordHash,
            },
          },
          roleAssignments: {
            create: {
              id: newId('request'),
              roleKey: input.role,
            },
          },
          // Sensible defaults so a new user receives transactional messages
          // without having to opt in, while marketing still requires consent.
          notificationPreferences: {
            create: (['IN_APP', 'EMAIL', 'PUSH', 'SMS'] as const).map((channel) => ({
              id: newId('notificationPreference'),
              channel,
              enabled: true,
            })),
          },
          profiles: {
            create: {
              id: newId('profile'),
              type: profileTypeForRole(input.role),
              displayName: input.displayName,
            },
          },
        },
      });

      // The outbox row is written in the SAME transaction as the user. If the
      // transaction rolls back the event vanishes with it, so a welcome email
      // can never be sent for an account that was never created.
      await tx.outboxEvent.create({
        data: {
          id: newId('outboxEvent'),
          name: 'USER_CREATED',
          payload: { userId, role: input.role } as never,
          requestId: context.requestId ?? null,
          actor: userId,
        },
      });
    });
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      // Deliberately vague. A precise "that email is already registered" is a
      // membership oracle. The user who genuinely owns the address is guided by
      // the password-reset flow instead, which is why that message points there.
      throw errors.conflict(
        'That email address or phone number cannot be used. If you already have an account, try signing in or resetting your password.',
      );
    }
    throw error;
  }

  const createdSession = await createSession(userId, {
    ipAddress: context.ipAddress,
    userAgent: context.userAgent,
  });

  // Issue a verification token for whichever contact method was supplied.
  let verificationToken: string | null = null;
  let verificationDestination: string | null = null;

  if (input.email) {
    const issued = await issueToken(userId, 'EMAIL_VERIFICATION', input.email, {
      ipAddress: context.ipAddress,
    });
    verificationToken = issued.token;
    verificationDestination = input.email;
  } else if (input.phone) {
    const issued = await issueToken(userId, 'PHONE_VERIFICATION', input.phone, {
      ipAddress: context.ipAddress,
    });
    verificationToken = issued.token;
    verificationDestination = input.phone;
  }

  await recordAuditEvent({
    action: 'USER_REGISTERED',
    actor: userId,
    subject: userId,
    outcome: 'success',
    requestId: context.requestId,
    ipAddress: context.ipAddress ?? undefined,
    detail: { role: input.role },
  });

  return {
    userId,
    session: createdSession,
    verificationToken,
    verificationDestination,
  };
}

function profileTypeForRole(role: string): 'PATIENT' | 'DENTIST' | 'STUDENT' | 'SUPPLIER' {
  switch (role) {
    case 'dentist':
      return 'DENTIST';
    case 'student':
      return 'STUDENT';
    case 'supplier':
      return 'SUPPLIER';
    default:
      return 'PATIENT';
  }
}

// ---------------------------------------------------------------------------
// Login
// ---------------------------------------------------------------------------

/**
 * Account lockout thresholds.
 *
 * Locking the ACCOUNT on failed attempts is a denial-of-service vector: anyone
 * who knows an email can lock its owner out. So the lock is soft and short, and
 * the primary defence is the IP-keyed rate limit applied at the route.
 */
const MAX_FAILED_ATTEMPTS = 10;
const LOCKOUT_WINDOW_MINUTES = 15;

/**
 * A correct password yields a session — unless the account has a second
 * factor, in which case it yields only a short-lived challenge that must be
 * redeemed with that factor (see ./mfa.ts). The union makes it impossible for
 * a caller to treat a half-authenticated user as signed in.
 */
export type LoginResult =
  | { readonly kind: 'session'; readonly userId: string; readonly session: CreatedSession }
  | {
      readonly kind: 'mfa_required';
      readonly userId: string;
      readonly challengeToken: string;
      readonly expiresAt: Date;
    };

/**
 * Authenticate.
 *
 * Every failure path returns the same generic error and takes a broadly similar
 * amount of time: a password is verified even when no user was found, against a
 * dummy hash. Without that, "no such user" returns in 1ms and "wrong password"
 * in 100ms, and the timing difference alone enumerates accounts.
 */
export async function login(
  input: LoginInput,
  context: { ipAddress?: string | null; userAgent?: string | null; requestId?: string } = {},
): Promise<LoginResult> {
  const identifier = input.identifier.trim().toLowerCase();
  const isEmail = identifier.includes('@');

  const user = await db().user.findFirst({
    where: isEmail ? { email: identifier } : { phone: input.identifier.trim() },
    include: { credentials: { where: { type: 'PASSWORD' } } },
  });

  const recentFailures = await countRecentFailures(identifier);
  if (recentFailures >= MAX_FAILED_ATTEMPTS) {
    await recordAttempt(identifier, user?.id ?? null, false, 'locked_out', context);
    // The owner is told once per lockout window, not once per blocked attempt:
    // an attacker hammering the form must not become a notification flood.
    if (user) {
      const alreadyAlerted = await db().securityEvent.count({
        where: {
          userId: user.id,
          type: 'ACCOUNT_LOCKED',
          occurredAt: { gte: new Date(Date.now() - LOCKOUT_WINDOW_MINUTES * 60 * 1000) },
        },
      });
      if (alreadyAlerted === 0) await recordSecurityEvent(user.id, 'ACCOUNT_LOCKED', context);
    }
    throw errors.rateLimited(LOCKOUT_WINDOW_MINUTES * 60);
  }

  const credential = user?.credentials[0];

  // Equalise timing when the account does not exist. `verifyPassword` on a
  // malformed hash returns false quickly, so a real scrypt round is needed —
  // hashing the supplied password achieves it and discards the result.
  if (!user || !credential) {
    await hashPassword(input.password);
    await recordAttempt(identifier, null, false, 'no_such_account', context);
    throw genericLoginFailure();
  }

  const passwordMatches = await verifyPassword(input.password, credential.secretHash);

  if (!passwordMatches) {
    await recordAttempt(identifier, user.id, false, 'bad_password', context);
    throw genericLoginFailure();
  }

  if (user.status !== 'ACTIVE' || user.deletedAt !== null) {
    await recordAttempt(identifier, user.id, false, `status_${user.status}`, context);

    // An account in its deletion grace period can be restored by its owner.
    // Saying so is safe: the caller has just proved they hold the password.
    if (user.status === 'DEACTIVATED' && user.deletedAt === null) {
      const pending = await db().accountDeletionRequest.findUnique({ where: { userId: user.id } });
      if (pending?.status === 'PENDING') {
        throw errors.preconditionFailed(
          'This account is scheduled for deletion. You can restore it before the deletion date.',
          { restorable: true, scheduledFor: pending.scheduledFor.toISOString() },
        );
      }
    }

    // Suspension is stated plainly: the user needs to know to contact support,
    // and someone who has just proved they hold the password is not an
    // anonymous attacker.
    throw errors.forbidden();
  }

  // Transparently upgrade a hash made under weaker parameters. The user never
  // sees this; it is the only moment their plaintext password is available.
  if (needsRehash(credential.secretHash)) {
    const upgraded = await hashPassword(input.password);
    void db()
      .credential.update({ where: { id: credential.id }, data: { secretHash: upgraded } })
      .catch((error: unknown) => logger.warn('Password rehash failed', { error }));
  }

  await db().credential.update({
    where: { id: credential.id },
    data: { lastUsedAt: new Date() },
  });

  // Second factor: the password was right, but it is not enough on its own.
  // No session and no "successful login" record until the factor is proven.
  if (await hasMfa(user.id)) {
    await recordAttempt(identifier, user.id, false, 'mfa_pending', context);
    const challenge = await issueMfaChallenge(user.id, context);
    return { kind: 'mfa_required', userId: user.id, ...challenge };
  }

  // Assessed before this attempt is recorded, so it is not its own precedent.
  const risk = await assessLogin(user.id, identifier, context);
  await recordAttempt(identifier, user.id, true, null, context);

  const session = await createSession(user.id, {
    ipAddress: context.ipAddress,
    userAgent: context.userAgent,
  });

  if (risk.suspicious) {
    await recordSecurityEvent(user.id, 'SUSPICIOUS_LOGIN', context);
  } else if (risk.newDevice) {
    await recordSecurityEvent(user.id, 'NEW_DEVICE_LOGIN', context);
  }

  await recordAuditEvent({
    action: 'USER_LOGIN',
    actor: user.id,
    subject: user.id,
    outcome: 'success',
    requestId: context.requestId,
    ipAddress: context.ipAddress ?? undefined,
    userAgent: context.userAgent ?? undefined,
    detail: { newDevice: risk.newDevice, suspicious: risk.suspicious },
  });

  return { kind: 'session', userId: user.id, session };
}

/**
 * Restore an account during its deletion grace period, then sign in.
 *
 * Takes the password rather than a session because the account has none —
 * requesting deletion signed it out everywhere. Every failure is the same
 * generic login failure, so this cannot be used to find accounts pending
 * deletion.
 */
export async function restoreAccount(
  input: LoginInput,
  context: { ipAddress?: string | null; userAgent?: string | null; requestId?: string } = {},
): Promise<LoginResult> {
  const identifier = input.identifier.trim().toLowerCase();
  const user = await db().user.findFirst({
    where: identifier.includes('@') ? { email: identifier } : { phone: input.identifier.trim() },
    include: { credentials: { where: { type: 'PASSWORD' } }, accountDeletionRequest: true },
  });

  const credential = user?.credentials[0];
  if (!user || !credential) {
    await hashPassword(input.password);
    throw genericLoginFailure();
  }
  if (!(await verifyPassword(input.password, credential.secretHash))) {
    await recordAttempt(identifier, user.id, false, 'bad_password', context);
    throw genericLoginFailure();
  }
  if (user.accountDeletionRequest?.status !== 'PENDING' || user.deletedAt !== null) {
    throw genericLoginFailure();
  }

  await cancelAccountDeletion(user.id, context);
  await recordSecurityEvent(user.id, 'ACCOUNT_RESTORED', context);

  return login(input, context);
}

/**
 * One message for every failure reason.
 *
 * "Incorrect password" versus "no such account" is the difference between a
 * login form and an account-enumeration API.
 */
function genericLoginFailure() {
  // 401, the same for a wrong password and an unknown account.
  return errors.unauthenticated('That email, phone number or password is incorrect.');
}

async function countRecentFailures(identifier: string): Promise<number> {
  const since = new Date(Date.now() - LOCKOUT_WINDOW_MINUTES * 60 * 1000);
  return db().loginAttempt.count({
    where: { identifier, success: false, occurredAt: { gte: since } },
  });
}

async function recordAttempt(
  identifier: string,
  userId: string | null,
  success: boolean,
  reason: string | null,
  context: { ipAddress?: string | null; userAgent?: string | null },
): Promise<void> {
  try {
    await db().loginAttempt.create({
      data: {
        id: newId('request'),
        identifier,
        userId,
        success,
        reason,
        ipAddress: context.ipAddress ?? null,
        userAgent: context.userAgent ?? null,
      },
    });
  } catch (error) {
    // Never let attempt logging break a login. A failure here loses a security
    // signal; throwing would lock everyone out.
    logger.warn('Failed to record login attempt', { error });
  }
}

// ---------------------------------------------------------------------------
// Verification
// ---------------------------------------------------------------------------

/** Confirm an email address or phone number from a token. */
export async function verifyContact(
  token: string,
  type: 'EMAIL_VERIFICATION' | 'PHONE_VERIFICATION',
  context: { requestId?: string } = {},
): Promise<{ userId: string }> {
  const redemption = await redeemToken(token, type);

  if (!redemption.ok) {
    throw errors.validation(
      redemption.reason === 'expired'
        ? 'That verification link has expired. Request a new one.'
        : 'That verification link is not valid.',
    );
  }

  const now = new Date();

  if (type === 'EMAIL_VERIFICATION') {
    // A token issued to a NEW address is an email change: the address the
    // token was sent to becomes the account's email only now, once the user
    // has proved they read mail there.
    const user = await db().user.findUnique({ where: { id: redemption.userId }, select: { email: true } });
    const changing = user?.email?.toLowerCase() !== redemption.destination.toLowerCase();
    try {
      await db().user.update({
        where: { id: redemption.userId },
        data: changing ? { email: redemption.destination, emailVerifiedAt: now } : { emailVerifiedAt: now },
      });
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw errors.conflict('That email address is already used by another account.');
      }
      throw error;
    }
  } else {
    await db().user.update({ where: { id: redemption.userId }, data: { phoneVerifiedAt: now } });
  }

  await recordAuditEvent({
    action: type === 'EMAIL_VERIFICATION' ? 'EMAIL_VERIFIED' : 'PHONE_VERIFIED',
    actor: redemption.userId,
    subject: redemption.userId,
    outcome: 'success',
    requestId: context.requestId,
  });
  await recordSecurityEvent(
    redemption.userId,
    type === 'EMAIL_VERIFICATION' ? 'EMAIL_VERIFIED' : 'PHONE_VERIFIED',
    { requestId: context.requestId },
  );

  return { userId: redemption.userId };
}

/**
 * Issue and send an email verification link.
 *
 * The link travels as transient data: it is interpolated into the email and
 * never written to the delivery record. Returns the REAL delivery outcome —
 * with no email provider configured, `sent` is false and the UI must say so
 * rather than "check your inbox".
 */
export async function sendEmailVerification(
  userId: string,
  context: { ipAddress?: string | null; requestId?: string } = {},
): Promise<{ sent: boolean; reason: string | null }> {
  const user = await db().user.findUnique({ where: { id: userId } });
  if (!user?.email) throw errors.preconditionFailed('Add an email address first.');
  if (user.emailVerifiedAt) throw errors.preconditionFailed('Your email address is already verified.');

  const issued = await issueToken(userId, 'EMAIL_VERIFICATION', user.email, {
    ipAddress: context.ipAddress,
  });

  const result = await notifyUser({
    userId,
    notificationId: 'TL-NOTIF-EMAIL-VERIFY-001',
    // Sent to the address being verified — the only message that may go to an
    // unverified address, because proving ownership of it is the point.
    overrideContact: { email: user.email },
    data: { name: user.displayName ?? 'there' },
    transientData: { verifyUrl: absoluteUrl(`/verify?token=${encodeURIComponent(issued.token)}`) },
    requestId: context.requestId,
  });

  const email = result.outcomes.find((o) => o.channel === 'email');
  return { sent: email?.status === 'sent', reason: email?.status === 'sent' ? null : (email?.reason ?? null) };
}

/**
 * Change the account's email address.
 *
 * Needs the password — an unattended signed-in session must not be able to
 * redirect the account's recovery channel — and completes only when the link
 * sent to the NEW address is opened. Until then the old address stays in
 * force. Whether the new address belongs to another account is not revealed
 * here; it surfaces as a conflict when the link is used, to the person who
 * controls that mailbox.
 */
export async function requestEmailChange(
  userId: string,
  rawNewEmail: string,
  password: string,
  context: { ipAddress?: string | null; requestId?: string } = {},
): Promise<{ sent: boolean; reason: string | null }> {
  const parsed = emailSchema.safeParse(rawNewEmail);
  if (!parsed.success) throw errors.validation('Enter a valid email address.', { field: 'newEmail' });
  const newEmail = parsed.data;

  const credential = await db().credential.findFirst({ where: { userId, type: 'PASSWORD' } });
  if (!credential || !(await verifyPassword(password, credential.secretHash))) {
    throw errors.validation('Your password is incorrect.', { field: 'password' });
  }

  const user = await db().user.findUnique({ where: { id: userId }, select: { email: true, displayName: true } });
  if (!user) throw errors.notFound('Account');
  if (user.email?.toLowerCase() === newEmail) {
    throw errors.validation('That is already your email address.', { field: 'newEmail' });
  }

  const issued = await issueToken(userId, 'EMAIL_VERIFICATION', newEmail, { ipAddress: context.ipAddress });
  const result = await notifyUser({
    userId,
    notificationId: 'TL-NOTIF-EMAIL-VERIFY-001',
    overrideContact: { email: newEmail },
    data: { name: user.displayName ?? 'there' },
    transientData: { verifyUrl: absoluteUrl(`/verify?token=${encodeURIComponent(issued.token)}`) },
    requestId: context.requestId,
  });

  await recordAuditEvent({
    action: 'EMAIL_CHANGE_REQUESTED',
    actor: userId,
    subject: userId,
    outcome: 'success',
    requestId: context.requestId,
  });

  const email = result.outcomes.find((o) => o.channel === 'email');
  return { sent: email?.status === 'sent', reason: email?.status === 'sent' ? null : (email?.reason ?? null) };
}

// ---------------------------------------------------------------------------
// Phone verification by one-time code
// ---------------------------------------------------------------------------

/**
 * Send a six-digit code to a phone number.
 *
 * The challenge (a keyed hash of the code, bound to the number) is held in an
 * `OTP_PHONE` credential with an attempt budget. The number the code was sent
 * to is recorded with it, so the code cannot confirm a different number.
 */
export async function requestPhoneVerification(
  userId: string,
  rawPhone: string | undefined,
  context: { requestId?: string } = {},
): Promise<{ sent: boolean; reason: string | null; expiresAt: Date }> {
  const user = await db().user.findUnique({ where: { id: userId } });
  if (!user) throw errors.notFound('Account');

  const phone = rawPhone ? phoneSchema.parse(rawPhone) : user.phone;
  if (!phone) throw errors.validation('Enter a phone number.', { field: 'phone' });
  if (user.phone === phone && user.phoneVerifiedAt) {
    throw errors.preconditionFailed('That phone number is already verified.');
  }

  const existing = await db().credential.findFirst({ where: { userId, type: 'OTP_PHONE' } });
  if (existing && !canResendOtp(existing.updatedAt)) {
    throw errors.rateLimited(60);
  }

  const { challenge, code } = createOtpChallenge(phone, derivedSecret('otp-code'));

  await transaction(async (tx) => {
    await tx.credential.deleteMany({ where: { userId, type: 'OTP_PHONE' } });
    await tx.credential.create({
      data: {
        id: newId('credential'),
        userId,
        type: 'OTP_PHONE',
        secretHash: challenge.codeHash,
        externalId: phone,
        attemptsRemaining: challenge.attemptsRemaining,
        expiresAt: challenge.expiresAt,
      },
    });
  });

  const result = await notifyUser({
    userId,
    notificationId: 'TL-NOTIF-PHONE-OTP-001',
    overrideContact: { phone },
    transientData: { code, minutes: String(Math.round(OTP_TTL_SECONDS / 60)) },
    requestId: context.requestId,
  });

  const sms = result.outcomes.find((o) => o.channel === 'sms');
  return {
    sent: sms?.status === 'sent',
    reason: sms?.status === 'sent' ? null : (sms?.reason ?? null),
    expiresAt: challenge.expiresAt,
  };
}

export async function confirmPhoneVerification(
  userId: string,
  code: string,
  context: { requestId?: string } = {},
): Promise<{ phone: string }> {
  const credential = await db().credential.findFirst({ where: { userId, type: 'OTP_PHONE' } });
  if (!credential?.externalId || !credential.expiresAt) {
    throw errors.preconditionFailed('Request a new code first.');
  }

  const { result, challenge } = verifyOtpCode(
    {
      codeHash: credential.secretHash,
      expiresAt: credential.expiresAt,
      attemptsRemaining: credential.attemptsRemaining ?? 0,
      createdAt: credential.createdAt,
    },
    code.trim(),
    credential.externalId,
    derivedSecret('otp-code'),
  );

  if (!result.ok) {
    await db().credential.update({
      where: { id: credential.id },
      data: { attemptsRemaining: challenge.attemptsRemaining },
    });
    throw errors.validation(
      result.reason === 'expired'
        ? 'That code has expired. Request a new one.'
        : result.reason === 'exhausted'
          ? 'Too many incorrect codes. Request a new one.'
          : `That code is not correct. ${challenge.attemptsRemaining} attempt(s) left.`,
      { field: 'code' },
    );
  }

  try {
    await transaction(async (tx) => {
      await tx.user.update({
        where: { id: userId },
        data: { phone: credential.externalId, phoneVerifiedAt: new Date() },
      });
      await tx.credential.delete({ where: { id: credential.id } });
    });
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      throw errors.conflict('That phone number is linked to another account.');
    }
    throw error;
  }

  await recordSecurityEvent(userId, 'PHONE_VERIFIED', { requestId: context.requestId });
  return { phone: credential.externalId };
}

// ---------------------------------------------------------------------------
// Password reset
// ---------------------------------------------------------------------------

export interface PasswordResetRequest {
  /** Null when no account matched. The caller must not reveal which. */
  readonly token: string | null;
  readonly userId: string | null;
  readonly destination: string | null;
}

/**
 * Begin a password reset.
 *
 * Returns nulls for an unknown address rather than throwing. The API route
 * responds identically either way — "if an account exists, we've sent a link" —
 * because a distinguishable response is an enumeration oracle.
 */
export async function requestPasswordReset(
  email: string,
  context: { ipAddress?: string | null; requestId?: string } = {},
): Promise<PasswordResetRequest> {
  const normalized = email.trim().toLowerCase();
  const user = await db().user.findUnique({ where: { email: normalized } });

  if (!user || user.deletedAt !== null || user.status === 'SUSPENDED') {
    return { token: null, userId: null, destination: null };
  }

  const issued = await issueToken(user.id, 'PASSWORD_RESET', normalized, {
    ipAddress: context.ipAddress,
  });

  await recordAuditEvent({
    action: 'PASSWORD_RESET_REQUESTED',
    actor: user.id,
    subject: user.id,
    outcome: 'success',
    requestId: context.requestId,
    ipAddress: context.ipAddress ?? undefined,
  });

  return { token: issued.token, userId: user.id, destination: normalized };
}

/**
 * Complete a password reset.
 *
 * Revokes every existing session on success. Password reset is the flow a
 * compromised user goes through, and leaving the attacker's session alive would
 * defeat the entire exercise.
 */
export async function completePasswordReset(
  token: string,
  newPassword: string,
  context: { requestId?: string; ipAddress?: string | null } = {},
): Promise<{ userId: string; sessionsRevoked: number }> {
  const policy = checkPasswordPolicy(newPassword);
  if (!policy.valid) {
    throw errors.validation('That password cannot be used.', {
      issues: policy.problems.map((message) => ({ field: 'password', message })),
    });
  }

  const redemption = await redeemToken(token, 'PASSWORD_RESET');
  if (!redemption.ok) {
    throw errors.validation(
      redemption.reason === 'expired'
        ? 'That reset link has expired. Request a new one.'
        : 'That reset link is not valid.',
    );
  }

  const passwordHash = await hashPassword(newPassword);

  /*
   * findFirst-then-write rather than upsert.
   *
   * The unique key is (userId, type, provider) and `provider` is NULL for a
   * password credential. PostgreSQL treats NULLs as distinct in a unique index,
   * so that constraint does not actually prevent duplicate password rows and an
   * upsert on it would not reliably match the existing one.
   *
   * The read-then-write race is harmless here: both branches write the same
   * hash for the same user, and the token that authorised it has already been
   * atomically consumed, so only one reset can reach this point.
   */
  await transaction(async (tx) => {
    const existing = await tx.credential.findFirst({
      where: { userId: redemption.userId, type: 'PASSWORD' },
    });

    if (existing) {
      await tx.credential.update({
        where: { id: existing.id },
        data: { secretHash: passwordHash },
      });
    } else {
      await tx.credential.create({
        data: {
          id: newId('credential'),
          userId: redemption.userId,
          type: 'PASSWORD',
          secretHash: passwordHash,
        },
      });
    }
  });

  const sessionsRevoked = await revokeAllSessions(redemption.userId);
  await recordSecurityEvent(redemption.userId, 'PASSWORD_RESET', {
    ipAddress: context.ipAddress,
    requestId: context.requestId,
  });

  await recordAuditEvent({
    action: 'PASSWORD_RESET_COMPLETED',
    actor: redemption.userId,
    subject: redemption.userId,
    outcome: 'success',
    requestId: context.requestId,
    ipAddress: context.ipAddress ?? undefined,
    detail: { sessionsRevoked },
  });

  return { userId: redemption.userId, sessionsRevoked };
}

/**
 * Change a password while signed in.
 *
 * Requires the current password even though the user is authenticated: it is
 * the check that stops an unattended logged-in device from becoming a permanent
 * account takeover.
 */
export async function changePassword(
  userId: string,
  currentPassword: string,
  newPassword: string,
  options: { keepSessionId?: string; requestId?: string } = {},
): Promise<{ sessionsRevoked: number }> {
  const credential = await db().credential.findFirst({
    where: { userId, type: 'PASSWORD' },
  });

  if (!credential || !(await verifyPassword(currentPassword, credential.secretHash))) {
    await recordAuditEvent({
      action: 'PASSWORD_CHANGE',
      actor: userId,
      subject: userId,
      outcome: 'denied',
      requestId: options.requestId,
    });
    throw errors.validation('Your current password is incorrect.', {
      field: 'currentPassword',
    });
  }

  const policy = checkPasswordPolicy(newPassword);
  if (!policy.valid) {
    throw errors.validation('That password cannot be used.', {
      issues: policy.problems.map((message) => ({ field: 'newPassword', message })),
    });
  }

  await db().credential.update({
    where: { id: credential.id },
    data: { secretHash: await hashPassword(newPassword) },
  });

  // Other devices are signed out; the current one is kept so the user is not
  // ejected from the page they just used.
  const sessionsRevoked = await revokeAllSessions(userId, {
    exceptSessionId: options.keepSessionId,
  });
  await recordSecurityEvent(userId, 'PASSWORD_CHANGED', { requestId: options.requestId });

  await recordAuditEvent({
    action: 'PASSWORD_CHANGE',
    actor: userId,
    subject: userId,
    outcome: 'success',
    requestId: options.requestId,
    detail: { sessionsRevoked },
  });

  return { sessionsRevoked };
}

// ---------------------------------------------------------------------------
// Account deletion
// ---------------------------------------------------------------------------

/** Grace period before erasure runs. */
export const DELETION_GRACE_DAYS = 30;

/**
 * Request account deletion.
 *
 * Scheduled, not immediate. The delay gives a user who was compromised or acted
 * in haste a window to cancel, and lets legally required retention run. Audit
 * history survives regardless — Constitution §8 forbids deleting it.
 */
export async function requestAccountDeletion(
  userId: string,
  reason: string | undefined,
  context: { requestId?: string } = {},
): Promise<{ scheduledFor: Date }> {
  const scheduledFor = new Date(Date.now() + DELETION_GRACE_DAYS * 24 * 3600 * 1000);

  await db().accountDeletionRequest.upsert({
    where: { userId },
    create: {
      id: newId('request'),
      userId,
      reason: reason ?? null,
      scheduledFor,
    },
    update: {
      status: 'PENDING',
      reason: reason ?? null,
      scheduledFor,
      cancelledAt: null,
    },
  });

  await db().user.update({ where: { id: userId }, data: { status: 'DEACTIVATED' } });
  await revokeAllSessions(userId);
  await recordSecurityEvent(userId, 'DELETION_REQUESTED', { requestId: context.requestId }, {
    scheduledFor: scheduledFor.toISOString(),
  });

  await recordAuditEvent({
    action: 'ACCOUNT_DELETION_REQUESTED',
    actor: userId,
    subject: userId,
    outcome: 'success',
    requestId: context.requestId,
    detail: { scheduledFor: scheduledFor.toISOString() },
  });

  return { scheduledFor };
}

/** Cancel a pending deletion and reactivate the account. */
export async function cancelAccountDeletion(
  userId: string,
  context: { requestId?: string } = {},
): Promise<void> {
  const request = await db().accountDeletionRequest.findUnique({ where: { userId } });
  if (!request || request.status !== 'PENDING') {
    throw errors.notFound('Pending deletion request');
  }

  await transaction(async (tx) => {
    await tx.accountDeletionRequest.update({
      where: { userId },
      data: { status: 'CANCELLED', cancelledAt: new Date() },
    });
    await tx.user.update({ where: { id: userId }, data: { status: 'ACTIVE' } });
  });

  await recordAuditEvent({
    action: 'ACCOUNT_DELETION_CANCELLED',
    actor: userId,
    subject: userId,
    outcome: 'success',
    requestId: context.requestId,
  });
}

/**
 * TOOTHLOGY LEAD QUALIFICATION
 *
 * The only place that decides whether a lead is billable. Controllers never
 * decide it, and neither does the lead service: they gather facts and ask.
 *
 * The rule is configuration (LeadQualificationRule, versioned per country),
 * and every decision records the rule id, its version and a plain reason —
 * so "why was I charged for this?" always has an answer that points at the
 * exact rule in force at the time.
 *
 * `evaluate` is pure: facts in, decision out. Loading the facts is separate
 * and is the only part that touches the database.
 */

import { z } from 'zod';
import { db } from '../db/client';
import { errors } from '../kernel/errors';

export const qualificationCriteriaSchema = z.object({
  /** The patient must have verified an email address or phone number. */
  requireVerifiedContact: z.boolean().default(true),
  /** A booking lead qualifies when its appointment reaches this state. */
  qualifyBookingOn: z.enum(['REQUESTED', 'CONFIRMED', 'COMPLETED']).default('CONFIRMED'),
  /** Whether "please call me" requests can qualify at all. */
  qualifyCallbacks: z.boolean().default(true),
  /** The same patient, practice and service within this many days is one lead. */
  dedupeWindowDays: z.number().int().min(0).max(365).default(30),
  /**
   * Email domains of test accounts (for example a QA team's). Leads from them
   * are recorded but never billable.
   */
  testEmailDomains: z.array(z.string().trim().toLowerCase().min(3).max(120)).max(50).default([]),
});

export type QualificationCriteria = z.infer<typeof qualificationCriteriaSchema>;

export interface QualificationFacts {
  readonly source: 'BOOKING' | 'CALLBACK_REQUEST';
  /** For bookings: the appointment's current status. */
  readonly appointmentStatus?: string | null;
  readonly patientContactVerified: boolean;
  /** An earlier lead with the same dedupe key inside the window, if any. */
  readonly earlierDuplicateId: string | null;
  readonly patientIsPracticeMember: boolean;
  /** The patient holds a Toothlogy staff role (support, moderation, administration). */
  readonly patientIsStaff?: boolean;
  /** The patient's email address, to recognise configured test accounts. */
  readonly patientEmail?: string | null;
}

export type QualificationDecision =
  | { decision: 'QUALIFIED'; reason: string }
  | { decision: 'NOT_QUALIFIED'; reason: string }
  | { decision: 'DUPLICATE'; reason: string; duplicateOfId: string }
  /** Not decidable yet: the booking has not reached the qualifying state. */
  | { decision: 'WAIT'; reason: string };

const ORDER = ['REQUESTED', 'CONFIRMED', 'COMPLETED'];

export function evaluate(criteria: QualificationCriteria, facts: QualificationFacts): QualificationDecision {
  if (facts.patientIsPracticeMember) {
    return { decision: 'NOT_QUALIFIED', reason: 'The patient is a member of this practice.' };
  }
  if (facts.patientIsStaff) {
    return { decision: 'NOT_QUALIFIED', reason: 'Internal lead: the patient is Toothlogy staff.' };
  }
  const domain = facts.patientEmail?.split('@')[1]?.toLowerCase();
  if (domain && criteria.testEmailDomains.includes(domain)) {
    return { decision: 'NOT_QUALIFIED', reason: `Test lead: ${domain} is a configured test domain.` };
  }
  if (facts.earlierDuplicateId) {
    return {
      decision: 'DUPLICATE',
      reason: `Same patient, practice and service as an earlier lead within ${criteria.dedupeWindowDays} days.`,
      duplicateOfId: facts.earlierDuplicateId,
    };
  }
  if (criteria.requireVerifiedContact && !facts.patientContactVerified) {
    return { decision: 'NOT_QUALIFIED', reason: 'The patient has not verified an email address or phone number.' };
  }
  if (facts.source === 'CALLBACK_REQUEST') {
    return criteria.qualifyCallbacks
      ? { decision: 'QUALIFIED', reason: 'Callback request from a verified patient.' }
      : { decision: 'NOT_QUALIFIED', reason: 'Callback requests do not qualify under the current rule.' };
  }
  const reached = ORDER.indexOf(facts.appointmentStatus ?? '');
  const needed = ORDER.indexOf(criteria.qualifyBookingOn);
  if (reached < 0 || reached < needed) {
    return { decision: 'WAIT', reason: `Qualifies when the appointment is ${criteria.qualifyBookingOn.toLowerCase()}.` };
  }
  return { decision: 'QUALIFIED', reason: `Booking ${facts.appointmentStatus?.toLowerCase()} for a verified patient.` };
}

/** The rule in force for a country now. Refuses in a market with none. */
export async function activeRule(countryCode: string, at: Date = new Date()) {
  const rule = await db().leadQualificationRule.findFirst({
    where: { countryCode: countryCode.toUpperCase(), isActive: true, effectiveFrom: { lte: at } },
    orderBy: { version: 'desc' },
  });
  if (!rule) {
    throw errors.preconditionFailed(`Lead qualification is not configured for ${countryCode}. No lead there can be billed until it is.`);
  }
  const parsed = qualificationCriteriaSchema.safeParse(rule.criteria);
  if (!parsed.success) {
    throw errors.preconditionFailed(`The lead qualification rule for ${countryCode} (version ${rule.version}) is malformed.`);
  }
  return { id: rule.id, version: rule.version, criteria: parsed.data };
}

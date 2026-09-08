/**
 * TOOTHLOGY ANALYTICS PORT
 *
 * Founding spec §22: no noisy or meaningless logging, and never log secrets or
 * sensitive data unnecessarily. Analytics is where that rule is most often
 * broken, because "just send the whole object" is the fastest way to ship an
 * event.
 *
 * So the constraint is enforced in the type system rather than in a guideline:
 * event properties are restricted to `string | number | boolean`, which makes
 * it impossible to pass a whole user, appointment or clinical record. Anything
 * richer requires a deliberate decision about which scalar fields to send.
 *
 * `sanitizeProperties` then strips anything whose key looks identifying, so an
 * event carrying `email` or `phone` loses it before dispatch. Analytics
 * providers are third parties; PHI must not reach them, and consent governs
 * what PII may (Constitution §5, P4).
 */

import { createProviderSlot } from '../integrations/provider';

export type AnalyticsValue = string | number | boolean;

export interface AnalyticsEvent {
  /** `noun_verb` past tense, e.g. `appointment_booked`. */
  readonly name: string;
  /** Pseudonymous ID, never an email or phone number. */
  readonly distinctId: string;
  readonly properties?: Readonly<Record<string, AnalyticsValue>>;
  readonly timestamp?: Date;
}

export interface AnalyticsPort {
  track(event: AnalyticsEvent): Promise<void>;
  /** Attach non-identifying traits to a pseudonymous profile. */
  identify(distinctId: string, traits: Readonly<Record<string, AnalyticsValue>>): Promise<void>;
  /** Flush buffered events. Called on shutdown so the last events are not lost. */
  flush(): Promise<void>;
}

export const analyticsProvider = createProviderSlot<AnalyticsPort>('analytics');

/**
 * Property keys that never leave the platform, whatever a caller passes.
 *
 * Substring matching, so `userEmail`, `patient_email` and `EMAIL` are all
 * caught. A dropped analytics property costs a dashboard column; a leaked one
 * costs a privacy incident.
 */
const FORBIDDEN_PROPERTY_PATTERNS: readonly string[] = [
  'email',
  'phone',
  'mobile',
  'name',
  'address',
  'dob',
  'birth',
  'aadhaar',
  'pan',
  'password',
  'token',
  'diagnosis',
  'prescription',
  'symptom',
  'treatmentnote',
];

export function sanitizeProperties(
  properties: Readonly<Record<string, AnalyticsValue>>,
): Record<string, AnalyticsValue> {
  const out: Record<string, AnalyticsValue> = {};
  for (const [key, value] of Object.entries(properties)) {
    const lower = key.toLowerCase();
    if (FORBIDDEN_PROPERTY_PATTERNS.some((pattern) => lower.includes(pattern))) continue;
    out[key] = value;
  }
  return out;
}

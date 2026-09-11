/**
 * How an appointment's status reads to a person, in one place, so the
 * patient's and the practice's screens never describe the same state
 * differently.
 */

import type { BadgeTone } from '@/design-system';

export const STATUS_LABELS: Record<string, { label: string; tone: BadgeTone }> = {
  REQUESTED: { label: 'Awaiting the clinic', tone: 'warning' },
  PENDING: { label: 'Awaiting your confirmation', tone: 'warning' },
  CONFIRMED: { label: 'Confirmed', tone: 'success' },
  CHECKED_IN: { label: 'Checked in', tone: 'info' },
  IN_PROGRESS: { label: 'In progress', tone: 'info' },
  COMPLETED: { label: 'Completed', tone: 'neutral' },
  CANCELLED: { label: 'Cancelled', tone: 'neutral' },
  REJECTED: { label: 'Declined', tone: 'danger' },
  NO_SHOW: { label: 'Missed', tone: 'danger' },
  EXPIRED: { label: 'Lapsed', tone: 'neutral' },
};

/** The practice reads PENDING from the other side: waiting on the patient. */
export const PRACTICE_STATUS_LABELS: Record<string, { label: string; tone: BadgeTone }> = {
  ...STATUS_LABELS,
  REQUESTED: { label: 'Needs your response', tone: 'warning' },
  PENDING: { label: 'Waiting for the patient', tone: 'warning' },
};

export const TYPE_LABELS: Record<string, string> = { CLINIC: 'Clinic visit', VIDEO: 'Video', HOME_VISIT: 'Home visit' };

/**
 * Which practice actions to offer for an appointment right now — the same
 * rules as the state machine in src/platform/appointments/service.ts, applied
 * to what is shown. The API remains the authority.
 */

import type { AllowedPracticeActions } from './practice-actions';

export function allowedPracticeActions(
  a: { status: string; startsAt: Date; endsAt: Date; rescheduleCount: number },
  now: number = Date.now(),
): AllowedPracticeActions {
  const checkInOpen = now >= a.startsAt.getTime() - 60 * 60_000 && now <= a.endsAt.getTime();
  return {
    confirm: a.status === 'REQUESTED',
    reject: a.status === 'REQUESTED',
    checkIn: a.status === 'CONFIRMED' && checkInOpen,
    start: a.status === 'CHECKED_IN',
    complete: a.status === 'CHECKED_IN' || a.status === 'IN_PROGRESS',
    noShow: a.status === 'CONFIRMED' && now >= a.startsAt.getTime(),
    cancel: ['REQUESTED', 'PENDING', 'CONFIRMED'].includes(a.status),
    reschedule: ['REQUESTED', 'CONFIRMED'].includes(a.status),
  };
}

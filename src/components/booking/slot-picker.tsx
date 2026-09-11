/**
 * Slot picker.
 *
 * Asks the availability API for the dates that have free slots, then for the
 * slots on the chosen date. Every time shown is one the server generated from
 * the practice's real state a moment ago; nothing here invents a slot. The
 * booking itself re-checks inside its transaction, so a slot taken in the
 * meantime is refused there and this picker is refreshed.
 *
 * Times are shown in the branch's timezone and say so, because a patient
 * travelling to a clinic needs the clinic's clock.
 */

'use client';

import { useCallback, useEffect, useState } from 'react';
import { Alert, Button, Spinner } from '@/design-system';
import { api } from '@/lib/api-client';
import { addDays, localDateOf } from '@/lib/zoned-time';

export interface PickedSlot {
  readonly startsAt: string;
  readonly endsAt: string;
  readonly localDate: string;
  readonly localTime: string;
}

interface DatesResponse {
  dates: Array<{ date: string; slots: number }>;
  timezone: string;
  reason: string | null;
}

interface SlotsResponse {
  slots: PickedSlot[];
  timezone: string;
  reason: string | null;
}

function dayLabel(date: string): { weekday: string; day: string } {
  const d = new Date(`${date}T00:00:00Z`);
  return {
    weekday: new Intl.DateTimeFormat('en-IN', { weekday: 'short', timeZone: 'UTC' }).format(d),
    day: new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(d),
  };
}

function period(localTime: string): 'Morning' | 'Afternoon' | 'Evening' {
  const hour = Number(localTime.slice(0, 2));
  return hour < 12 ? 'Morning' : hour < 17 ? 'Afternoon' : 'Evening';
}

export function SlotPicker({
  practiceId,
  serviceOfferingId,
  type,
  emergency = false,
  timezone,
  days = 30,
  selected,
  excludeStartsAt,
  onSelect,
  onNoAvailability,
}: {
  practiceId: string;
  serviceOfferingId?: string | null;
  type: 'CLINIC' | 'VIDEO' | 'HOME_VISIT';
  emergency?: boolean;
  timezone: string;
  days?: number;
  selected: string | null;
  /** The appointment's current start when moving it: not offered as "new". */
  excludeStartsAt?: string;
  onSelect: (slot: PickedSlot | null) => void;
  onNoAvailability?: (reason: string | null) => void;
}) {
  /*
   * Each response is stored with the key of the request that produced it, and
   * anything whose key differs from the current one reads as "loading". So a
   * change of practice, service or type shows loading at once without the
   * effects having to clear state synchronously.
   */
  const [attempt, setAttempt] = useState(0);
  const query = useCallback(
    (extra: Record<string, string>) => {
      const params = new URLSearchParams({ type, ...extra });
      if (serviceOfferingId) params.set('serviceOfferingId', serviceOfferingId);
      if (emergency) params.set('emergency', '1');
      return params.toString();
    },
    [type, serviceOfferingId, emergency],
  );
  const datesKey = `${practiceId}?${query({})}|${timezone}|${days}|${attempt}`;
  const [datesResult, setDatesResult] = useState<{ key: string; dates: DatesResponse['dates']; reason: string | null; error: string | null } | null>(null);
  const [picked, setPicked] = useState<{ key: string; date: string } | null>(null);
  const [slotsResult, setSlotsResult] = useState<{ key: string; slots: PickedSlot[]; error: string | null } | null>(null);

  const current = datesResult?.key === datesKey ? datesResult : null;
  const dates = current && !current.error ? current.dates : null;
  const datesError = current?.error ?? null;
  const reason = current?.reason ?? null;
  const date = picked?.key === datesKey ? picked.date : (dates?.[0]?.date ?? null);
  const slotsKey = `${datesKey}|${date}|${excludeStartsAt ?? ''}`;
  const slotsCurrent = slotsResult?.key === slotsKey ? slotsResult : null;
  const slots = slotsCurrent && !slotsCurrent.error ? slotsCurrent.slots : null;
  const slotsError = slotsCurrent?.error ?? null;

  useEffect(() => {
    let cancelled = false;
    const from = localDateOf(new Date(), timezone);
    const to = addDays(from, days);
    void api.get<DatesResponse>(`/api/v1/practices/${practiceId}/availability/dates?${query({ from, to })}`).then((result) => {
      if (cancelled) return;
      // A new set of dates invalidates whatever time was chosen before.
      onSelect(null);
      if (!result.ok) return setDatesResult({ key: datesKey, dates: [], reason: null, error: result.message });
      setDatesResult({ key: datesKey, dates: result.data.dates, reason: result.data.reason, error: null });
      if (result.data.dates.length === 0) onNoAvailability?.(result.data.reason);
    });
    return () => {
      cancelled = true;
    };
    // onSelect/onNoAvailability are callbacks from the parent; re-running on
    // their identity would refetch on every parent render. datesKey already
    // encodes every input that changes the request.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [datesKey]);

  useEffect(() => {
    if (!date) return;
    let cancelled = false;
    void api.get<SlotsResponse>(`/api/v1/practices/${practiceId}/availability/slots?${query({ date })}`).then((result) => {
      if (cancelled) return;
      if (!result.ok) return setSlotsResult({ key: slotsKey, slots: [], error: result.message });
      setSlotsResult({ key: slotsKey, slots: result.data.slots.filter((s) => s.startsAt !== excludeStartsAt), error: null });
    });
    return () => {
      cancelled = true;
    };
    // slotsKey encodes practice, query, date and the excluded start.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slotsKey]);

  if (datesError) {
    return (
      <Alert tone="danger" title="Could not load availability">
        {datesError}{' '}
        <Button size="sm" variant="secondary" onClick={() => setAttempt((n) => n + 1)}>
          Try again
        </Button>
      </Alert>
    );
  }
  if (dates === null) {
    return (
      <p className="tl-muted" role="status">
        <Spinner /> Loading free dates…
      </p>
    );
  }
  if (dates.length === 0) {
    return (
      <Alert tone="info" title="No free times in the next few weeks">
        {reason ?? 'Every slot is taken or the practice is not open in this period.'}
      </Alert>
    );
  }

  const groups = new Map<string, PickedSlot[]>();
  for (const s of slots ?? []) groups.set(period(s.localTime), [...(groups.get(period(s.localTime)) ?? []), s]);

  return (
    <div className="tl-stack">
      <div role="group" aria-label="Choose a date" className="tl-inline" style={{ overflowX: 'auto', flexWrap: 'nowrap', paddingBlockEnd: 4 }}>
        {dates.map((d) => {
          const label = dayLabel(d.date);
          return (
            <Button
              key={d.date}
              size="sm"
              variant={d.date === date ? 'primary' : 'secondary'}
              aria-pressed={d.date === date}
              onClick={() => {
                setPicked({ key: datesKey, date: d.date });
                onSelect(null);
              }}
            >
              {label.weekday} {label.day}
            </Button>
          );
        })}
      </div>

      <p className="tl-muted" style={{ margin: 0 }}>
        Times are in the clinic’s timezone ({timezone}).
      </p>

      {slotsError ? (
        <Alert tone="danger" title="Could not load times">
          {slotsError}{' '}
          <Button size="sm" variant="secondary" onClick={() => setAttempt((n) => n + 1)}>
            Try again
          </Button>
        </Alert>
      ) : slots === null ? (
        <p className="tl-muted" role="status">
          <Spinner /> Loading times…
        </p>
      ) : slots.length === 0 ? (
        <p className="tl-muted">No free times left on this date. Choose another.</p>
      ) : (
        [...groups.entries()].map(([name, list]) => (
          <div key={name} role="group" aria-label={`${name} times`} className="tl-stack">
            <strong>{name}</strong>
            <div className="tl-inline" style={{ flexWrap: 'wrap' }}>
              {list.map((s) => (
                <Button
                  key={s.startsAt}
                  size="sm"
                  variant={selected === s.startsAt ? 'primary' : 'secondary'}
                  aria-pressed={selected === s.startsAt}
                  onClick={() => onSelect(s)}
                >
                  {s.localTime}
                </Button>
              ))}
            </div>
          </div>
        ))
      )}
    </div>
  );
}

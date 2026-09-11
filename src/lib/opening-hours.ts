/**
 * Opening hours for forms.
 *
 * The database stores hours as rows of minutes from local midnight — one row
 * per session, several per day for split shifts (09:00–13:00 and 17:00–21:00
 * is the norm in Indian clinics). People edit them as "HH:MM" per weekday.
 * This module converts between the two and finds the mistakes a person makes
 * in a form, so the form can name the day and the problem before submitting.
 *
 * Pure: no React, no fetch. The server validates again; this is for the
 * person, not for security.
 */

export interface HoursRow {
  readonly dayOfWeek: number;
  readonly opensAtMinutes: number;
  readonly closesAtMinutes: number;
}

export interface Session {
  readonly opens: string;
  readonly closes: string;
}

/** Index 0 = Sunday … 6 = Saturday, matching the stored `dayOfWeek`. */
export type WeekSessions = readonly (readonly Session[])[];

export const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const;

/** Monday first — the week as clinics print it. */
export const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0] as const;

/** The server's limit on sessions across the week. */
export const MAX_SESSIONS = 21;

export function minutesToHHMM(minutes: number): string {
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}

/**
 * "HH:MM" → minutes. "24:00" is accepted as end of day, and only as a closing
 * time. Null for anything that is not a time.
 */
export function hhmmToMinutes(value: string, role: 'opens' | 'closes' = 'opens'): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (minutes > 59) return null;
  if (hours === 24 && minutes === 0) return role === 'closes' ? 1440 : null;
  if (hours > 23) return null;
  return hours * 60 + minutes;
}

export function emptyWeek(): Session[][] {
  return Array.from({ length: 7 }, () => []);
}

export function fromRows(rows: readonly HoursRow[]): Session[][] {
  const week = emptyWeek();
  const sorted = [...rows].sort((a, b) => a.dayOfWeek - b.dayOfWeek || a.opensAtMinutes - b.opensAtMinutes);
  for (const r of sorted) {
    week[r.dayOfWeek]?.push({ opens: minutesToHHMM(r.opensAtMinutes), closes: minutesToHHMM(r.closesAtMinutes) });
  }
  return week;
}

export interface ToRowsResult {
  readonly rows: HoursRow[];
  /** Keyed by dayOfWeek; one plain-language message per day with a problem. */
  readonly errors: Partial<Record<number, string>>;
  /** A problem that is about the whole week rather than one day. */
  readonly weekError: string | null;
}

export function toRows(week: WeekSessions): ToRowsResult {
  const rows: HoursRow[] = [];
  const errors: Partial<Record<number, string>> = {};

  week.forEach((sessions, day) => {
    const parsed: HoursRow[] = [];
    for (const s of sessions) {
      const opens = hhmmToMinutes(s.opens, 'opens');
      const closes = hhmmToMinutes(s.closes, 'closes');
      if (opens === null || closes === null) {
        errors[day] = 'Enter times like 09:00 and 13:30.';
        return;
      }
      if (closes <= opens) {
        errors[day] = `Closing time must be after opening time (${s.opens}–${s.closes}).`;
        return;
      }
      parsed.push({ dayOfWeek: day, opensAtMinutes: opens, closesAtMinutes: closes });
    }
    parsed.sort((a, b) => a.opensAtMinutes - b.opensAtMinutes);
    for (let i = 1; i < parsed.length; i += 1) {
      if (parsed[i]!.opensAtMinutes < parsed[i - 1]!.closesAtMinutes) {
        errors[day] = `Two sessions overlap (${minutesToHHMM(parsed[i - 1]!.opensAtMinutes)}–${minutesToHHMM(
          parsed[i - 1]!.closesAtMinutes,
        )} and ${minutesToHHMM(parsed[i]!.opensAtMinutes)}–${minutesToHHMM(parsed[i]!.closesAtMinutes)}).`;
        return;
      }
    }
    rows.push(...parsed);
  });

  const weekError = rows.length > MAX_SESSIONS ? `At most ${MAX_SESSIONS} sessions across the week.` : null;
  return { rows, errors, weekError };
}

/** Copy one day's sessions onto other days (e.g. Monday → Tuesday–Saturday). */
export function copyDay(week: WeekSessions, from: number, to: readonly number[]): Session[][] {
  const source = week[from] ?? [];
  return week.map((sessions, day) => (to.includes(day) ? source.map((s) => ({ ...s })) : [...sessions]));
}

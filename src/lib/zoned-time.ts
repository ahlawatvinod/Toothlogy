/**
 * Wall-clock time in a named timezone ↔ instants.
 *
 * Pure and dependency-free, so both the availability engine (server) and the
 * slot picker (browser) use the same arithmetic. Working hours are minutes
 * after local midnight in the branch's timezone; everything else is an
 * instant. Converting in one place is what keeps a 09:00 clinic from opening
 * at 08:00 for half the year.
 */

const DAY = 86_400_000;

function offsetMs(timeZone: string, at: Date): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(at);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'));
  return asUtc - Math.floor(at.getTime() / 1000) * 1000;
}

/** A local date (YYYY-MM-DD) and minutes after local midnight → the instant. */
export function zonedToUtc(date: string, minutes: number, timeZone: string): Date {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  const guess = Date.UTC(y, m - 1, d, 0, minutes);
  const first = offsetMs(timeZone, new Date(guess));
  let utc = guess - first;
  const second = offsetMs(timeZone, new Date(utc));
  if (second !== first) utc = guess - second;
  return new Date(utc);
}

/** The local calendar date of an instant, YYYY-MM-DD. */
export function localDateOf(at: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(at);
}

/** Minutes after local midnight of an instant. */
export function localMinutesOf(at: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(at);
  return Number(parts.find((p) => p.type === 'hour')?.value) * 60 + Number(parts.find((p) => p.type === 'minute')?.value);
}

export function addDays(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY).toISOString().slice(0, 10);
}

/** "2026-10-05T14:30" read as wall-clock time in `timeZone` → ISO instant. */
export function localDateTimeToIso(value: string, timeZone: string): string | null {
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!match) return null;
  return zonedToUtc(match[1]!, Number(match[2]) * 60 + Number(match[3]), timeZone).toISOString();
}

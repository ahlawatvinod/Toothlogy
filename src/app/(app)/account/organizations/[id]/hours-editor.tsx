/**
 * Weekly opening hours, as a person edits them.
 *
 * Monday first. Each day holds zero or more sessions; a day with none is
 * closed, and a second session is how a split shift (09:00–13:00 and
 * 17:00–21:00) is entered. Errors come from `toRows` and are shown on the day
 * they concern, so "Wednesday: two sessions overlap" replaces a generic
 * "invalid hours".
 *
 * Controlled: the parent owns the week and decides when to save it.
 */

'use client';

import { Button } from '@/design-system';
import { DAY_NAMES, WEEK_ORDER, copyDay, type Session } from '@/lib/opening-hours';

export function HoursEditor({
  idPrefix,
  value,
  onChange,
  errors = {},
}: {
  idPrefix: string;
  value: Session[][];
  onChange: (next: Session[][]) => void;
  errors?: Partial<Record<number, string>>;
}) {
  const setDay = (day: number, sessions: Session[]) => onChange(value.map((s, d) => (d === day ? sessions : s)));

  return (
    <fieldset className="tl-fieldset">
      <legend className="tl-fieldset__legend">Opening hours</legend>
      <p className="tl-muted" style={{ marginBlockStart: 0 }}>
        A day with no sessions shows as closed. Add a second session for a split shift.
      </p>

      {WEEK_ORDER.map((day) => {
        const sessions = value[day] ?? [];
        const dayId = `${idPrefix}-day-${day}`;
        return (
          <div key={day} role="group" aria-labelledby={dayId} className="tl-stack" style={{ marginBlockEnd: 'var(--tl-space-3)' }}>
            <div className="tl-card__title-row">
              <strong id={dayId}>{DAY_NAMES[day]}</strong>
              {sessions.length === 0 ? <span className="tl-muted">Closed</span> : null}
            </div>

            {sessions.map((s, index) => (
              <div key={index} className="tl-inline">
                <label>
                  <span className="tl-muted">Opens </span>
                  <input
                    type="time"
                    className="tl-input"
                    value={s.opens}
                    aria-label={`${DAY_NAMES[day]}, session ${index + 1}, opens`}
                    onChange={(e) => setDay(day, sessions.map((x, i) => (i === index ? { ...x, opens: e.target.value } : x)))}
                  />
                </label>
                <label>
                  <span className="tl-muted">Closes </span>
                  <input
                    type="time"
                    className="tl-input"
                    value={s.closes}
                    aria-label={`${DAY_NAMES[day]}, session ${index + 1}, closes`}
                    onChange={(e) => setDay(day, sessions.map((x, i) => (i === index ? { ...x, closes: e.target.value } : x)))}
                  />
                </label>
                <Button
                  size="sm"
                  variant="ghost"
                  aria-label={`Remove ${DAY_NAMES[day]} session ${index + 1}`}
                  onClick={() => setDay(day, sessions.filter((_, i) => i !== index))}
                >
                  Remove
                </Button>
              </div>
            ))}

            <div className="tl-inline">
              <Button
                size="sm"
                variant="secondary"
                onClick={() =>
                  setDay(day, [
                    ...sessions,
                    sessions.length === 0 ? { opens: '09:00', closes: '13:00' } : { opens: '17:00', closes: '21:00' },
                  ])
                }
              >
                {sessions.length === 0 ? `Open on ${DAY_NAMES[day]}` : 'Add a session'}
              </Button>
              {day === 1 && sessions.length > 0 ? (
                <Button size="sm" variant="ghost" onClick={() => onChange(copyDay(value, 1, [2, 3, 4, 5, 6]))}>
                  Copy Monday to Tuesday–Saturday
                </Button>
              ) : null}
            </div>

            {errors[day] ? (
              <p className="tl-field__error" role="alert" style={{ margin: 0 }}>
                {errors[day]}
              </p>
            ) : null}
          </div>
        );
      })}
    </fieldset>
  );
}

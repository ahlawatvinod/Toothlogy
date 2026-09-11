/**
 * The "which dentist" questions and answer. Everything runs here in the
 * browser from the fixed rules; nothing is sent to Toothlogy or stored.
 */

'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Alert, Button, Card, CardBody, CardHeader } from '@/design-system';
import { routeConcerns, type Route } from '@/platform/triage/rules';

const MAX_CONCERNS = 5;

export function ConcernRouter({
  concerns,
  redFlags,
  emergencyNumber,
  specialtyNames,
  treatmentNames,
}: {
  concerns: ReadonlyArray<{ key: string; label: string }>;
  redFlags: ReadonlyArray<{ key: string; label: string }>;
  emergencyNumber: string | null;
  specialtyNames: Readonly<Record<string, string>>;
  treatmentNames: Readonly<Record<string, string>>;
}) {
  const [flags, setFlags] = useState<string[]>([]);
  const [chosen, setChosen] = useState<string[]>([]);
  const [forChild, setForChild] = useState(false);
  const [route, setRoute] = useState<Route | null>(null);
  const [error, setError] = useState<string | null>(null);
  const toggle = (list: string[], set: (v: string[]) => void, key: string, on: boolean) => set(on ? [...list, key] : list.filter((k) => k !== key));

  function answer(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    if (flags.length === 0 && chosen.length === 0) return setError('Choose what is bothering you.');
    if (chosen.length > MAX_CONCERNS) return setError(`Choose up to ${MAX_CONCERNS}.`);
    setRoute(routeConcerns({ concerns: chosen, redFlags: flags, forChild }));
  }

  const name = (key: string) => specialtyNames[key] ?? key.replace(/_/g, ' ');

  return (
    <div className="tl-stack">
      <form onSubmit={answer} className="tl-stack" noValidate>
        <fieldset className="tl-fieldset">
          <legend className="tl-fieldset__legend">Is any of this happening now?</legend>
          <div className="tl-stack">
            {redFlags.map((f) => (
              <label key={f.key} className="tl-checkbox">
                <input type="checkbox" checked={flags.includes(f.key)} onChange={(e) => toggle(flags, setFlags, f.key, e.target.checked)} />
                <span>{f.label}</span>
              </label>
            ))}
          </div>
        </fieldset>
        <fieldset className="tl-fieldset">
          <legend className="tl-fieldset__legend">What is bothering you? (up to {MAX_CONCERNS})</legend>
          <div className="tl-stack">
            {concerns.map((c) => (
              <label key={c.key} className="tl-checkbox">
                <input type="checkbox" checked={chosen.includes(c.key)} onChange={(e) => toggle(chosen, setChosen, c.key, e.target.checked)} />
                <span>{c.label}</span>
              </label>
            ))}
          </div>
        </fieldset>
        <label className="tl-checkbox">
          <input type="checkbox" checked={forChild} onChange={(e) => setForChild(e.target.checked)} />
          <span>This is for a child</span>
        </label>
        {error ? <Alert tone="danger">{error}</Alert> : null}
        <div>
          <Button type="submit">Show where to go</Button>
        </div>
      </form>

      {route ? (
        <Card label="Where to go">
          <CardHeader>
            <strong>Where to go</strong>
          </CardHeader>
          <CardBody>
            <div className="tl-stack">
              {route.urgency === 'EMERGENCY_NOW' ? (
                <Alert tone="danger" title="Get emergency care now">
                  Go to a hospital emergency department now{emergencyNumber ? `, or call ${emergencyNumber}` : ', or call your local emergency number'}. Do not wait for a dental appointment.
                </Alert>
              ) : route.urgency === 'WITHIN_THE_HOUR' ? (
                <Alert tone="warning" title="See a dentist within the hour">
                  Look for a dentist who sees emergencies now.
                </Alert>
              ) : route.urgency === 'SOON' ? (
                <Alert tone="info" title="See a dentist soon">
                  Try to be seen in the next day or two, sooner if it gets worse.
                </Alert>
              ) : (
                <Alert tone="info" title="Book a routine visit">
                  This can wait for a visit at a time that suits you.
                </Alert>
              )}
              {route.notes.map((n) => (
                <p key={n} style={{ margin: 0 }}>
                  {n}
                </p>
              ))}
              {route.specialties.length > 0 ? (
                <p style={{ margin: 0 }}>
                  <strong>Kind of dentist:</strong> start with {name(route.specialties[0]!)}
                  {route.specialties.length > 1 ? `; they may refer you to ${route.specialties.slice(1).map(name).join(' or ')}` : ''}.
                </p>
              ) : null}
              {route.treatments.length > 0 ? (
                <p style={{ margin: 0 }}>
                  <strong>What they may offer:</strong>{' '}
                  {route.treatments.map((t, i) => (
                    <span key={t}>
                      {i > 0 ? ', ' : ''}
                      <Link href={`/knowledge?q=${encodeURIComponent(treatmentNames[t] ?? t)}`}>{treatmentNames[t] ?? t}</Link>
                    </span>
                  ))}
                  . Only a dentist who examines you can say what you need.
                </p>
              ) : null}
              {route.findQuery ? (
                <div>
                  <Link className="tl-button tl-button--primary" href={`/find?${route.findQuery}`}>
                    <span>Find {route.urgency === 'WITHIN_THE_HOUR' ? 'a dentist who sees emergencies' : `a dentist: ${name(route.specialties[0]!)}`}</span>
                  </Link>
                </div>
              ) : null}
              <p className="tl-muted" style={{ margin: 0 }}>
                Guidance from fixed rules — not AI, and not a diagnosis. The rules have not yet been reviewed by a Toothlogy clinical reviewer. If you are worried, see a dentist or a doctor.
              </p>
            </div>
          </CardBody>
        </Card>
      ) : null}
    </div>
  );
}

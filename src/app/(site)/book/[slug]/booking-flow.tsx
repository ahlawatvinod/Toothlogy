/**
 * The booking steps, on one page so a phone user never loses their place:
 * branch → service → how → date → time → who → confirm.
 *
 * One idempotency key per booking intent. It is created when the patient
 * reaches the confirm step and reused on every retry of that same intent, so
 * a double tap or a dropped connection returns the booking that was made
 * instead of making a second one. Changing any choice starts a new intent.
 *
 * The success panel shows exactly what the server said: "confirmed" only when
 * the practice takes instant bookings, otherwise "requested — the clinic will
 * confirm by …".
 */

'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import { Alert, Badge, Button, Card, CardBody, CardHeader, Field, Input } from '@/design-system';
import { api, newIdempotencyKey } from '@/lib/api-client';
import { SlotPicker, type PickedSlot } from '@/components/booking/slot-picker';

type AppointmentType = 'CLINIC' | 'VIDEO' | 'HOME_VISIT';

export interface BookablePractice {
  readonly id: string;
  readonly locationName: string;
  readonly organizationName: string;
  readonly organizationSlug: string;
  readonly locality: string | null;
  readonly timezone: string;
  readonly autoConfirm: boolean;
  readonly bookingPaused: boolean;
  readonly accepts: { readonly video: boolean; readonly homeVisit: boolean; readonly emergency: boolean };
  readonly homeVisitRadiusKm: number | null;
  readonly consultationLabel: string;
  readonly services: ReadonlyArray<{
    readonly id: string;
    readonly name: string;
    readonly priceLabel: string;
    readonly durationMinutes: number | null;
    readonly appointmentTypes: readonly string[];
    readonly requiresConsultation: boolean;
    readonly dentistSpecific: boolean;
  }>;
}

interface Booked {
  appointmentId: string;
  status: string;
  startsAt: string;
  expiresAt: string | null;
  replayed: boolean;
}

const TYPE_LABELS: Record<AppointmentType, string> = { CLINIC: 'Visit the clinic', VIDEO: 'Video consultation', HOME_VISIT: 'Home visit' };

function whenLabel(iso: string, timezone: string): string {
  return new Intl.DateTimeFormat('en-IN', { dateStyle: 'full', timeStyle: 'short', timeZone: timezone }).format(new Date(iso));
}

export function BookingFlow({
  dentist,
  practices,
  signedIn,
  dependents: initialDependents,
  initial,
  source,
  loginHref,
  sponsoredClickId = null,
}: {
  dentist: { id: string; name: string; slug: string };
  practices: readonly BookablePractice[];
  signedIn: boolean;
  dependents: ReadonlyArray<{ id: string; name: string; relationship: string }>;
  initial: { practiceId: string | null; serviceOfferingId: string | null; rebookId: string | null; type: AppointmentType | null };
  source: 'SEARCH' | 'PROFILE' | 'REBOOK' | 'CLINIC_PAGE';
  loginHref: string;
  /** The sponsored click this visit came from, for attribution only. */
  sponsoredClickId?: string | null;
}) {
  const [practiceId, setPracticeId] = useState(
    practices.find((p) => p.id === initial.practiceId)?.id ?? (practices.length === 1 ? practices[0]!.id : ''),
  );
  const practice = practices.find((p) => p.id === practiceId) ?? null;
  const [serviceId, setServiceId] = useState<string | null>(
    practice?.services.find((s) => s.id === initial.serviceOfferingId)?.id ?? null,
  );
  const service = practice?.services.find((s) => s.id === serviceId) ?? null;
  // A type carried from search or a past appointment is kept only where this
  // practice offers it.
  const [type, setType] = useState<AppointmentType>(() => {
    const accepts = practices.find((p) => p.id === initial.practiceId)?.accepts;
    if (initial.type === 'VIDEO' && accepts?.video) return 'VIDEO';
    if (initial.type === 'HOME_VISIT' && accepts?.homeVisit) return 'HOME_VISIT';
    return 'CLINIC';
  });
  const [emergency, setEmergency] = useState(false);
  const [slot, setSlot] = useState<PickedSlot | null>(null);
  const [pickerKey, setPickerKey] = useState(0);
  const [who, setWho] = useState<string>('self');
  const [dependents, setDependents] = useState(initialDependents);
  const [newName, setNewName] = useState('');
  const [newRelationship, setNewRelationship] = useState('CHILD');
  const [note, setNote] = useState('');
  const [visitAddress, setVisitAddress] = useState('');
  const [visitPoint, setVisitPoint] = useState<{ latitude: number; longitude: number } | null>(null);
  const [locating, setLocating] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [booked, setBooked] = useState<Booked | null>(null);
  const [sideNotice, setSideNotice] = useState<{ tone: 'success' | 'danger' | 'info'; text: string } | null>(null);
  const [noAvailability, setNoAvailability] = useState(false);
  const intentKey = useRef<string | null>(null);

  const newIntent = () => {
    intentKey.current = null;
    setError(null);
  };

  const allowedTypes: AppointmentType[] = (['CLINIC', 'VIDEO', 'HOME_VISIT'] as const).filter((t) => {
    if (!practice) return false;
    if (t === 'VIDEO' && !practice.accepts.video) return false;
    if (t === 'HOME_VISIT' && !practice.accepts.homeVisit) return false;
    if (service && service.appointmentTypes.length > 0 && !service.appointmentTypes.includes(t)) return false;
    return true;
  });

  function choosePractice(id: string) {
    setPracticeId(id);
    setServiceId(null);
    setType('CLINIC');
    setSlot(null);
    setNoAvailability(false);
    newIntent();
  }

  async function addFamilyMember() {
    if (newName.trim().length < 2) return setError('Enter their name.');
    const result = await api.post<{ dependent: { id: string; name: string; relationship: string } }>('/api/v1/me/dependents', {
      name: newName.trim(),
      relationship: newRelationship,
    });
    if (!result.ok) return setError(result.message);
    setDependents((prev) => [...prev, result.data.dependent]);
    setWho(result.data.dependent.id);
    setNewName('');
    setError(null);
  }

  function locateForVisit() {
    if (!('geolocation' in navigator)) return setError('Your browser cannot share its location. Home visits need the visit location.');
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setVisitPoint({ latitude: p.coords.latitude, longitude: p.coords.longitude });
        setLocating(false);
      },
      () => {
        setLocating(false);
        setError('Location permission was declined. A home visit needs the address location to check the clinic travels there.');
      },
      { enableHighAccuracy: true, timeout: 15_000 },
    );
  }

  async function book() {
    if (!practice || !slot) return;
    if (type === 'HOME_VISIT' && (!visitPoint || visitAddress.trim().length < 5)) {
      return setError('Enter the visit address and share the location, so the clinic can confirm it is within its area.');
    }
    intentKey.current ??= newIdempotencyKey();
    setSubmitting(true);
    setError(null);
    const result = await api.post<Booked>(
      '/api/v1/appointments',
      {
        practiceId: practice.id,
        serviceOfferingId: serviceId,
        type,
        emergency,
        startsAt: slot.startsAt,
        dependentId: who === 'self' ? null : who,
        patientNote: note.trim() || undefined,
        visit: type === 'HOME_VISIT' && visitPoint ? { address: visitAddress.trim(), ...visitPoint } : undefined,
        source,
        rebookedFromId: initial.rebookId ?? undefined,
        sponsoredClickId: sponsoredClickId ?? undefined,
      },
      { idempotencyKey: intentKey.current },
    );
    setSubmitting(false);
    if (result.ok) return setBooked(result.data);
    if (result.code === 'NETWORK_ERROR') {
      // Same key on the retry: if the first attempt did land, the retry
      // returns that booking rather than making a second.
      return setError(`${result.message} Your choice is kept — press Book again to retry safely.`);
    }
    if (result.code === 'CONFLICT') {
      setSlot(null);
      setPickerKey((n) => n + 1);
      newIntent();
    }
    setError(result.message);
  }

  async function joinWaitlist() {
    if (!practice) return;
    const today = new Date().toISOString().slice(0, 10);
    const until = new Date(Date.now() + 14 * 86_400_000).toISOString().slice(0, 10);
    const result = await api.post<{ entryId: string }>('/api/v1/waitlist', {
      dentistProfileId: dentist.id,
      serviceOfferingId: serviceId ?? undefined,
      type,
      earliestDate: today,
      latestDate: until,
    });
    setSideNotice(
      result.ok
        ? { tone: 'success', text: 'You are on the waitlist for the next two weeks. If a time opens, it is held for you and you are told.' }
        : { tone: 'danger', text: result.message },
    );
  }

  async function requestCallback() {
    if (!practice) return;
    const result = await api.post<{ message: string; status: string }>('/api/v1/leads/callback', {
      practiceId: practice.id,
      serviceOfferingId: serviceId ?? undefined,
      note: note.trim() || undefined,
    });
    setSideNotice(
      result.ok
        ? { tone: result.data.status === 'DELIVERED' ? 'success' : 'info', text: result.data.message }
        : { tone: 'danger', text: result.message },
    );
  }

  if (booked && practice) {
    const confirmed = booked.status === 'CONFIRMED';
    return (
      <Card label="Booking result">
        <CardBody>
          <Alert tone={confirmed ? 'success' : 'info'} title={confirmed ? 'Booked and confirmed' : 'Request sent'}>
            {confirmed
              ? `${whenLabel(booked.startsAt, practice.timezone)} with ${dentist.name} at ${practice.locationName}.`
              : `You asked for ${whenLabel(booked.startsAt, practice.timezone)}. The time is held for you while ${practice.organizationName} decides${booked.expiresAt ? `, by ${whenLabel(booked.expiresAt, practice.timezone)}` : ''}. You will be told either way.`}
          </Alert>
          <p>
            <Link href={`/account/appointments/${booked.appointmentId}`}>View your appointment</Link>
          </p>
        </CardBody>
      </Card>
    );
  }

  return (
    <div className="tl-stack">
      {error ? (
        <Alert tone="danger" title="Not booked">
          {error}
        </Alert>
      ) : null}
      {sideNotice ? <Alert tone={sideNotice.tone}>{sideNotice.text}</Alert> : null}

      <Card label="Branch">
        <CardHeader>
          <strong>1. Where</strong>
        </CardHeader>
        <CardBody>
          <fieldset className="tl-fieldset">
            <legend className="tl-fieldset__legend">Branch</legend>
            {practices.map((p) => (
              <label key={p.id} className="tl-checkbox">
                <input type="radio" name="practice" checked={practiceId === p.id} onChange={() => choosePractice(p.id)} disabled={p.bookingPaused} />
                <span>
                  <strong>{p.organizationName}</strong> · {p.locationName}
                  {p.locality ? `, ${p.locality}` : ''}
                  {p.bookingPaused ? ' — not taking new bookings right now' : ''}
                </span>
              </label>
            ))}
          </fieldset>
        </CardBody>
      </Card>

      {practice ? (
        <Card label="Service">
          <CardHeader>
            <strong>2. What for</strong>
          </CardHeader>
          <CardBody>
            <fieldset className="tl-fieldset">
              <legend className="tl-fieldset__legend">Service</legend>
              <label className="tl-checkbox">
                <input
                  type="radio"
                  name="service"
                  checked={serviceId === null}
                  onChange={() => {
                    setServiceId(null);
                    setSlot(null);
                    newIntent();
                  }}
                />
                <span>Consultation — {practice.consultationLabel}</span>
              </label>
              {practice.services.map((s) => (
                <label key={s.id} className="tl-checkbox">
                  <input
                    type="radio"
                    name="service"
                    checked={serviceId === s.id}
                    onChange={() => {
                      setServiceId(s.id);
                      setType('CLINIC');
                      setSlot(null);
                      newIntent();
                    }}
                  />
                  <span>
                    {s.name} — {s.priceLabel}
                    {s.durationMinutes ? ` · ${s.durationMinutes} min` : ''}
                    {s.dentistSpecific ? ' · this dentist’s price' : ''}
                    {s.requiresConsultation ? ' · usually after a consultation' : ''}
                  </span>
                </label>
              ))}
            </fieldset>
          </CardBody>
        </Card>
      ) : null}

      {practice ? (
        <Card label="Appointment type">
          <CardHeader>
            <strong>3. How</strong>
          </CardHeader>
          <CardBody>
            <fieldset className="tl-fieldset">
              <legend className="tl-fieldset__legend">Appointment type</legend>
              {allowedTypes.map((t) => (
                <label key={t} className="tl-checkbox">
                  <input
                    type="radio"
                    name="type"
                    checked={type === t}
                    onChange={() => {
                      setType(t);
                      setSlot(null);
                      newIntent();
                    }}
                  />
                  <span>
                    {TYPE_LABELS[t]}
                    {t === 'HOME_VISIT' && practice.homeVisitRadiusKm ? ` (within ${practice.homeVisitRadiusKm} km of the branch)` : ''}
                  </span>
                </label>
              ))}
              {practice.accepts.emergency ? (
                <label className="tl-checkbox">
                  <input
                    type="checkbox"
                    checked={emergency}
                    onChange={(e) => {
                      setEmergency(e.target.checked);
                      setSlot(null);
                      newIntent();
                    }}
                  />
                  <span>This is a dental emergency (severe pain, swelling, a knocked-out tooth) — shows the soonest times</span>
                </label>
              ) : null}
            </fieldset>
            {type === 'HOME_VISIT' ? (
              <div className="tl-stack">
                <Field label="Visit address" required>
                  {(props) => <Input {...props} value={visitAddress} onChange={(e) => setVisitAddress(e.target.value)} autoComplete="street-address" />}
                </Field>
                <div className="tl-inline">
                  <Button size="sm" variant="secondary" loading={locating} onClick={locateForVisit}>
                    Share the visit location
                  </Button>
                  {visitPoint ? <Badge tone="success">Location shared</Badge> : null}
                </div>
                <p className="tl-muted" style={{ margin: 0 }}>
                  Used only to check the address is inside the clinic’s home-visit area, and stored on this appointment for the visit.
                </p>
              </div>
            ) : null}
          </CardBody>
        </Card>
      ) : null}

      {practice ? (
        <Card label="Date and time">
          <CardHeader>
            <strong>4. When</strong>
          </CardHeader>
          <CardBody>
            <SlotPicker
              key={`${practice.id}-${serviceId}-${type}-${emergency}-${pickerKey}`}
              practiceId={practice.id}
              serviceOfferingId={serviceId}
              type={type}
              emergency={emergency}
              timezone={practice.timezone}
              selected={slot?.startsAt ?? null}
              onSelect={(s) => {
                setSlot(s);
                newIntent();
              }}
              onNoAvailability={() => setNoAvailability(true)}
            />
            {noAvailability && signedIn ? (
              <div className="tl-inline" style={{ marginBlockStart: 'var(--tl-space-3)' }}>
                <Button size="sm" variant="secondary" onClick={joinWaitlist}>
                  Join the waitlist for the next two weeks
                </Button>
                <Button size="sm" variant="ghost" onClick={requestCallback}>
                  Ask the clinic to call me
                </Button>
              </div>
            ) : null}
          </CardBody>
        </Card>
      ) : null}

      {practice && slot ? (
        !signedIn ? (
          <Card label="Sign in">
            <CardBody>
              <p style={{ marginTop: 0 }}>Sign in or create an account to book {slot.localTime} on {slot.localDate}. Your choice is kept in the link.</p>
              <Link className="tl-button tl-button--primary tl-button--md" href={loginHref}>
                <span>Sign in to book</span>
              </Link>
            </CardBody>
          </Card>
        ) : (
          <Card label="Confirm">
            <CardHeader>
              <strong>5. Who and confirm</strong>
            </CardHeader>
            <CardBody>
              <div className="tl-stack">
                <fieldset className="tl-fieldset">
                  <legend className="tl-fieldset__legend">Who is the appointment for?</legend>
                  <label className="tl-checkbox">
                    <input type="radio" name="who" checked={who === 'self'} onChange={() => setWho('self')} />
                    <span>Me</span>
                  </label>
                  {dependents.map((d) => (
                    <label key={d.id} className="tl-checkbox">
                      <input type="radio" name="who" checked={who === d.id} onChange={() => setWho(d.id)} />
                      <span>
                        {d.name} ({d.relationship.toLowerCase()})
                      </span>
                    </label>
                  ))}
                  <div className="tl-form-grid">
                    <Field label="Add a family member">
                      {(props) => <Input {...props} value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Their name" />}
                    </Field>
                    <Field label="Relationship">
                      {(props) => (
                        <select {...props} className="tl-input" value={newRelationship} onChange={(e) => setNewRelationship(e.target.value)}>
                          <option value="CHILD">Child</option>
                          <option value="PARENT">Parent</option>
                          <option value="SPOUSE">Spouse</option>
                          <option value="SIBLING">Sibling</option>
                          <option value="OTHER">Other</option>
                        </select>
                      )}
                    </Field>
                  </div>
                  <div>
                    <Button size="sm" variant="ghost" onClick={addFamilyMember}>
                      Add family member
                    </Button>
                  </div>
                </fieldset>

                <Field label="Anything the dentist should know?" hint="Optional. Seen only by the clinic.">
                  {(props) => <Input {...props} value={note} maxLength={1000} onChange={(e) => setNote(e.target.value)} />}
                </Field>

                <dl className="tl-kv">
                  <div>
                    <dt>With</dt>
                    <dd>{dentist.name}</dd>
                  </div>
                  <div>
                    <dt>Where</dt>
                    <dd>
                      {type === 'CLINIC' ? `${practice.organizationName}, ${practice.locationName}` : TYPE_LABELS[type]}
                    </dd>
                  </div>
                  <div>
                    <dt>When</dt>
                    <dd>{whenLabel(slot.startsAt, practice.timezone)}</dd>
                  </div>
                  <div>
                    <dt>For</dt>
                    <dd>{service ? `${service.name} — ${service.priceLabel}` : `Consultation — ${practice.consultationLabel}`}</dd>
                  </div>
                  <div>
                    <dt>Confirmation</dt>
                    <dd>
                      {practice.autoConfirm && !emergency
                        ? 'Confirmed as soon as you book.'
                        : 'A request: the clinic confirms it, and the time is held for you meanwhile.'}
                    </dd>
                  </div>
                </dl>
                <p className="tl-muted" style={{ margin: 0 }}>
                  Payment is made at the clinic. Toothlogy does not take payment for appointments.
                </p>
                <div>
                  <Button onClick={book} loading={submitting}>
                    {practice.autoConfirm && !emergency ? 'Book' : 'Send request'}
                  </Button>
                </div>
              </div>
            </CardBody>
          </Card>
        )
      ) : null}
    </div>
  );
}

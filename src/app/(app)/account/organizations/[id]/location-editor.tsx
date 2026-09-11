/**
 * One branch: contact and address, map position, opening hours, facilities,
 * capacity, accessibility, home visits, temporary closure and holidays.
 *
 * Facilities are chosen from a fixed list so "digital X-ray" is one
 * filterable fact. Closing a branch temporarily takes its dentists out of
 * search until it reopens; holidays remove only those days from booking.
 * Each section saves on its own, so a mistake in the hours does not block a
 * phone-number correction.
 */

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Alert, Badge, Button, Field, Input } from '@/design-system';
import { api } from '@/lib/api-client';
import { fromRows, toRows, type HoursRow, type Session } from '@/lib/opening-hours';
import { FACILITIES } from '@/platform/catalogue/facilities';
import { HoursEditor } from './hours-editor';

export interface ClosureRow {
  readonly id: string;
  readonly label: string;
  readonly reason: string | null;
}

export interface EditableLocation {
  readonly id: string;
  readonly name: string;
  readonly status: string;
  readonly phone: string | null;
  readonly email: string | null;
  readonly address: {
    readonly line1: string;
    readonly line2: string;
    readonly locality: string;
    readonly region: string;
    readonly postalCode: string;
    readonly countryCode: string;
  } | null;
  readonly latitude: number | null;
  readonly longitude: number | null;
  readonly hours: readonly HoursRow[];
  readonly facilities: readonly string[];
  readonly chairs: number | null;
  readonly wheelchairAccessible: boolean;
  readonly parkingAvailable: boolean;
  readonly emergencyAvailable: boolean;
  readonly homeVisitRadiusKm: number | null;
  readonly closures: readonly ClosureRow[];
  /** Today on the branch's calendar, YYYY-MM-DD: the earliest closure date. */
  readonly today: string;
}

type Notice = { tone: 'success' | 'danger'; text: string } | null;

function NoticeAlert({ notice }: { notice: Notice }) {
  if (!notice) return null;
  return (
    <Alert tone={notice.tone} title={notice.tone === 'success' ? 'Done' : 'Not saved'}>
      {notice.text}
    </Alert>
  );
}

export function LocationEditor({
  organizationId,
  location,
  countries,
}: {
  organizationId: string;
  location: EditableLocation;
  countries: ReadonlyArray<{ code: string; name: string }>;
}) {
  const router = useRouter();
  const base = `/api/v1/organizations/${organizationId}/locations/${location.id}`;

  // --- Contact, address, position -------------------------------------------
  const [phone, setPhone] = useState(location.phone ?? '');
  const [email, setEmail] = useState(location.email ?? '');
  const [line1, setLine1] = useState(location.address?.line1 ?? '');
  const [line2, setLine2] = useState(location.address?.line2 ?? '');
  const [locality, setLocality] = useState(location.address?.locality ?? '');
  const [region, setRegion] = useState(location.address?.region ?? '');
  const [postalCode, setPostalCode] = useState(location.address?.postalCode ?? '');
  const [countryCode, setCountryCode] = useState(location.address?.countryCode ?? countries[0]?.code ?? 'IN');
  const [latitude, setLatitude] = useState(location.latitude !== null ? String(location.latitude) : '');
  const [longitude, setLongitude] = useState(location.longitude !== null ? String(location.longitude) : '');
  const [savingContact, setSavingContact] = useState(false);
  const [contactNotice, setContactNotice] = useState<Notice>(null);

  // --- Hours -------------------------------------------------------------------
  const [hours, setHours] = useState<Session[][]>(fromRows(location.hours));
  const [hoursErrors, setHoursErrors] = useState<Partial<Record<number, string>>>({});
  const [savingHours, setSavingHours] = useState(false);
  const [hoursNotice, setHoursNotice] = useState<Notice>(null);

  // --- Facilities and access ---------------------------------------------------
  const [facilities, setFacilities] = useState<Set<string>>(new Set(location.facilities));
  const [chairs, setChairs] = useState(location.chairs ? String(location.chairs) : '');
  const [wheelchair, setWheelchair] = useState(location.wheelchairAccessible);
  const [parking, setParking] = useState(location.parkingAvailable);
  const [emergency, setEmergency] = useState(location.emergencyAvailable);
  const [homeVisit, setHomeVisit] = useState(location.homeVisitRadiusKm ? String(location.homeVisitRadiusKm) : '');
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);

  // --- Closures ----------------------------------------------------------------
  const [startsOn, setStartsOn] = useState('');
  const [endsOn, setEndsOn] = useState('');
  const [reason, setReason] = useState('');
  const [closureBusy, setClosureBusy] = useState<string | null>(null);
  const [closureError, setClosureError] = useState<string | null>(null);

  async function saveContact() {
    const lat = latitude.trim() ? Number(latitude) : null;
    const lng = longitude.trim() ? Number(longitude) : null;
    if ((lat === null) !== (lng === null)) return setContactNotice({ tone: 'danger', text: 'Enter both latitude and longitude.' });
    if ((lat !== null && Number.isNaN(lat)) || (lng !== null && Number.isNaN(lng))) {
      return setContactNotice({ tone: 'danger', text: 'Coordinates must be numbers, e.g. 21.2514 and 81.6296.' });
    }
    const anyAddress = [line1, line2, locality, region, postalCode].some((s) => s.trim());
    if (anyAddress && !line1.trim()) return setContactNotice({ tone: 'danger', text: 'Enter the first line of the address.' });

    setSavingContact(true);
    setContactNotice(null);
    const result = await api.patch(base, {
      phone: phone.trim() || null,
      email: email.trim() || null,
      ...(anyAddress
        ? {
            address: {
              lines: [line1.trim(), line2.trim()].filter(Boolean),
              ...(locality.trim() ? { locality: locality.trim() } : {}),
              ...(region.trim() ? { regionName: region.trim() } : {}),
              ...(postalCode.trim() ? { postalCode: postalCode.trim() } : {}),
              countryCode,
            },
          }
        : {}),
      ...(lat !== null && lng !== null ? { latitude: lat, longitude: lng } : {}),
    });
    setSavingContact(false);
    if (!result.ok) return setContactNotice({ tone: 'danger', text: result.message });
    setContactNotice({ tone: 'success', text: 'Contact details and address saved.' });
    router.refresh();
  }

  async function saveHours() {
    const result = toRows(hours);
    setHoursErrors(result.errors);
    if (Object.keys(result.errors).length > 0) return setHoursNotice({ tone: 'danger', text: 'Fix the days marked below.' });
    if (result.weekError) return setHoursNotice({ tone: 'danger', text: result.weekError });
    setSavingHours(true);
    setHoursNotice(null);
    const response = await api.put(`${base}/hours`, { hours: result.rows });
    setSavingHours(false);
    if (!response.ok) return setHoursNotice({ tone: 'danger', text: response.message });
    setHoursNotice({
      tone: 'success',
      text: result.rows.length === 0 ? 'Saved. Every day now shows as closed.' : 'Opening hours saved.',
    });
    router.refresh();
  }

  function toggleFacility(key: string, on: boolean) {
    setFacilities((prev) => {
      const next = new Set(prev);
      if (on) next.add(key);
      else next.delete(key);
      return next;
    });
  }

  async function save() {
    if (chairs && !/^\d+$/.test(chairs)) return setNotice({ tone: 'danger', text: 'Enter the number of chairs as a whole number.' });
    if (homeVisit && !/^\d+$/.test(homeVisit)) return setNotice({ tone: 'danger', text: 'Enter the home-visit distance in whole kilometres.' });
    setSaving(true);
    setNotice(null);
    const result = await api.patch(base, {
      facilities: [...facilities],
      ...(chairs ? { chairs: Number(chairs) } : {}),
      wheelchairAccessible: wheelchair,
      parkingAvailable: parking,
      emergencyAvailable: emergency,
      homeVisitRadiusKm: homeVisit ? Number(homeVisit) : null,
    });
    setSaving(false);
    if (!result.ok) return setNotice({ tone: 'danger', text: result.message });
    setNotice({ tone: 'success', text: 'Saved.' });
    router.refresh();
  }

  async function setStatus(status: 'ACTIVE' | 'TEMPORARILY_CLOSED') {
    setSaving(true);
    setNotice(null);
    const result = await api.patch(base, { status });
    setSaving(false);
    if (!result.ok) return setNotice({ tone: 'danger', text: result.message });
    setNotice({
      tone: 'success',
      text:
        status === 'ACTIVE'
          ? 'Reopened. Verified dentists here appear in search again.'
          : 'Marked temporarily closed. Dentists here are hidden from search for this branch until you reopen it.',
    });
    router.refresh();
  }

  async function addClosure(e: React.FormEvent) {
    e.preventDefault();
    if (!startsOn || !endsOn) return setClosureError('Choose the first and last day.');
    setClosureBusy('new');
    setClosureError(null);
    const result = await api.post(`${base}/closures`, { startsOn, endsOn, ...(reason.trim() ? { reason: reason.trim() } : {}) });
    setClosureBusy(null);
    if (!result.ok) return setClosureError(result.message);
    setStartsOn('');
    setEndsOn('');
    setReason('');
    router.refresh();
  }

  async function removeClosure(id: string) {
    setClosureBusy(id);
    setClosureError(null);
    const result = await api.delete(`${base}/closures?closureId=${encodeURIComponent(id)}`);
    setClosureBusy(null);
    if (!result.ok) return setClosureError(result.message);
    router.refresh();
  }

  const temporarilyClosed = location.status === 'TEMPORARILY_CLOSED';

  return (
    <details className="tl-stack">
      <summary>Manage {location.name}</summary>

      <section aria-label={`Contact and address for ${location.name}`} className="tl-stack">
        <h4 style={{ margin: 0 }}>Contact and address</h4>
        <NoticeAlert notice={contactNotice} />
        <div className="tl-form-grid">
          <Field label="Phone" hint="International format, e.g. +919876543210.">
            {(props) => <Input {...props} inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />}
          </Field>
          <Field label="Email">
            {(props) => <Input {...props} type="email" value={email} onChange={(e) => setEmail(e.target.value)} />}
          </Field>
        </div>
        <Field label="Address line 1">
          {(props) => <Input {...props} value={line1} onChange={(e) => setLine1(e.target.value)} />}
        </Field>
        <Field label="Address line 2">
          {(props) => <Input {...props} value={line2} onChange={(e) => setLine2(e.target.value)} />}
        </Field>
        <div className="tl-form-grid">
          <Field label="City or locality">
            {(props) => <Input {...props} value={locality} onChange={(e) => setLocality(e.target.value)} />}
          </Field>
          <Field label="State or region">
            {(props) => <Input {...props} value={region} onChange={(e) => setRegion(e.target.value)} />}
          </Field>
          <Field label="Postal code">
            {(props) => <Input {...props} inputMode="numeric" value={postalCode} onChange={(e) => setPostalCode(e.target.value)} />}
          </Field>
          <Field label="Country">
            {(props) => (
              <select {...props} className="tl-input" value={countryCode} onChange={(e) => setCountryCode(e.target.value)}>
                {countries.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.name}
                  </option>
                ))}
              </select>
            )}
          </Field>
          <Field label="Latitude" hint="Needed for distance search.">
            {(props) => <Input {...props} inputMode="decimal" value={latitude} onChange={(e) => setLatitude(e.target.value)} />}
          </Field>
          <Field label="Longitude">
            {(props) => <Input {...props} inputMode="decimal" value={longitude} onChange={(e) => setLongitude(e.target.value)} />}
          </Field>
        </div>
        <div>
          <Button variant="secondary" onClick={saveContact} loading={savingContact}>
            Save contact and address
          </Button>
        </div>
      </section>

      <section aria-label={`Opening hours for ${location.name}`} className="tl-stack">
        <NoticeAlert notice={hoursNotice} />
        <HoursEditor idPrefix={`hours-${location.id}`} value={hours} onChange={setHours} errors={hoursErrors} />
        <div>
          <Button variant="secondary" onClick={saveHours} loading={savingHours}>
            Save opening hours
          </Button>
        </div>
      </section>

      <section aria-label={`Facilities and access at ${location.name}`} className="tl-stack">
        <NoticeAlert notice={notice} />

        <fieldset className="tl-fieldset">
          <legend className="tl-fieldset__legend">Facilities</legend>
          {FACILITIES.map((f) => (
            <label key={f.key} className="tl-checkbox">
              <input type="checkbox" checked={facilities.has(f.key)} onChange={(e) => toggleFacility(f.key, e.target.checked)} />
              <span>{f.label}</span>
            </label>
          ))}
        </fieldset>

        <div className="tl-form-grid">
          <Field label="Dental chairs">
            {(props) => <Input {...props} inputMode="numeric" value={chairs} onChange={(e) => setChairs(e.target.value)} />}
          </Field>
          <Field label="Home visits within (km)" hint="Leave empty if you do not visit patients at home.">
            {(props) => <Input {...props} inputMode="numeric" value={homeVisit} onChange={(e) => setHomeVisit(e.target.value)} />}
          </Field>
        </div>

        <fieldset className="tl-fieldset">
          <legend className="tl-fieldset__legend">Access</legend>
          <label className="tl-checkbox">
            <input type="checkbox" checked={wheelchair} onChange={(e) => setWheelchair(e.target.checked)} />
            <span>Step-free, wheelchair-accessible entrance and treatment room</span>
          </label>
          <label className="tl-checkbox">
            <input type="checkbox" checked={parking} onChange={(e) => setParking(e.target.checked)} />
            <span>Parking available</span>
          </label>
          <label className="tl-checkbox">
            <input type="checkbox" checked={emergency} onChange={(e) => setEmergency(e.target.checked)} />
            <span>Sees dental emergencies without an appointment</span>
          </label>
        </fieldset>

        <div className="tl-inline">
          <Button onClick={save} loading={saving}>
            Save facilities and access
          </Button>
          {temporarilyClosed ? (
            <Button variant="secondary" onClick={() => setStatus('ACTIVE')} disabled={saving}>
              Reopen branch
            </Button>
          ) : (
            <Button variant="secondary" onClick={() => setStatus('TEMPORARILY_CLOSED')} disabled={saving}>
              Mark temporarily closed
            </Button>
          )}
        </div>
      </section>

      <section aria-label={`Holidays and closures at ${location.name}`} className="tl-stack">
        <h4 style={{ margin: 0 }}>Holidays and closures</h4>
        {closureError ? (
          <Alert tone="danger" title="Not saved">
            {closureError}
          </Alert>
        ) : null}
        {location.closures.length === 0 ? (
          <p className="tl-muted" style={{ margin: 0 }}>
            No upcoming closures. Patients can book on any day you are open.
          </p>
        ) : (
          <ul className="tl-list">
            {location.closures.map((c) => (
              <li key={c.id}>
                <div className="tl-card__title-row">
                  <strong>{c.label}</strong>
                  {c.reason ? <Badge tone="neutral">{c.reason}</Badge> : null}
                  <Button size="sm" variant="ghost" loading={closureBusy === c.id} onClick={() => removeClosure(c.id)}>
                    Remove
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
        <form onSubmit={addClosure} className="tl-form" noValidate>
          <div className="tl-form-grid">
            <Field label="First day closed" required>
              {(props) => (
                <Input {...props} type="date" min={location.today} value={startsOn} onChange={(e) => setStartsOn(e.target.value)} />
              )}
            </Field>
            <Field label="Last day closed" required>
              {(props) => (
                <Input {...props} type="date" min={startsOn || location.today} value={endsOn} onChange={(e) => setEndsOn(e.target.value)} />
              )}
            </Field>
          </div>
          <Field label="Reason" hint="Optional, shown to patients — e.g. Diwali.">
            {(props) => <Input {...props} maxLength={200} value={reason} onChange={(e) => setReason(e.target.value)} />}
          </Field>
          <Button type="submit" variant="secondary" loading={closureBusy === 'new'}>
            Add closure
          </Button>
        </form>
      </section>
    </details>
  );
}

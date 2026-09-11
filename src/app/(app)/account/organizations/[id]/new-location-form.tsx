/**
 * Add a branch.
 *
 * A branch is what a patient travels to, so the form asks for what gets them
 * there: an address, a map position and opening hours. Each is optional at
 * creation, but the consequence of leaving one out is said up front — no map
 * position means no distance search — and the server's own discoverability
 * verdict is shown after saving.
 *
 * "Find on map" uses whatever geocoder is configured. Without a maps provider
 * it resolves to the city centre, and the form says "approximate (city
 * centre)" rather than presenting a city pin as the clinic's door.
 */

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Alert, Button, Card, CardBody, CardHeader, Field, Input } from '@/design-system';
import { api } from '@/lib/api-client';
import { emptyWeek, toRows, type Session } from '@/lib/opening-hours';
import { HoursEditor } from './hours-editor';

interface GeocodeCandidate {
  point: { latitude: number; longitude: number };
  formattedAddress: string;
  address: { locality?: string; region?: string; postalCode?: string; countryCode: string };
  precision: 'street' | 'city';
}

interface CreatedLocation {
  locationId: string;
  discoverable: boolean;
  warning?: string;
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function NewLocationForm({
  organizationId,
  defaultTimezone,
  defaultCountry,
  timezones,
  countries,
  hasPrimary,
}: {
  organizationId: string;
  defaultTimezone: string;
  defaultCountry: string;
  timezones: ReadonlyArray<{ id: string; label: string }>;
  countries: ReadonlyArray<{ code: string; name: string }>;
  hasPrimary: boolean;
}) {
  const router = useRouter();
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [slugEdited, setSlugEdited] = useState(false);
  const [timezone, setTimezone] = useState(defaultTimezone);
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [isPrimary, setIsPrimary] = useState(!hasPrimary);
  const [line1, setLine1] = useState('');
  const [line2, setLine2] = useState('');
  const [locality, setLocality] = useState('');
  const [region, setRegion] = useState('');
  const [postalCode, setPostalCode] = useState('');
  const [countryCode, setCountryCode] = useState(defaultCountry);
  const [latitude, setLatitude] = useState('');
  const [longitude, setLongitude] = useState('');
  const [positionNote, setPositionNote] = useState<string | null>(null);
  const [hours, setHours] = useState<Session[][]>(emptyWeek());
  const [hoursErrors, setHoursErrors] = useState<Partial<Record<number, string>>>({});

  const [candidates, setCandidates] = useState<GeocodeCandidate[] | null>(null);
  const [streetLevel, setStreetLevel] = useState(true);
  const [looking, setLooking] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [created, setCreated] = useState<CreatedLocation | null>(null);

  async function findOnMap() {
    const query = [line1, locality, region].filter((s) => s.trim()).join(', ');
    if (query.trim().length < 2) {
      setFieldErrors((prev) => ({ ...prev, locality: 'Enter the city or locality first.' }));
      return;
    }
    setLooking(true);
    setCandidates(null);
    const result = await api.get<{ results: GeocodeCandidate[]; streetLevelAvailable: boolean }>(
      `/api/v1/geo/geocode?q=${encodeURIComponent(locality.trim() || query)}&country=${encodeURIComponent(countryCode)}`,
    );
    setLooking(false);
    if (!result.ok) return setFormError(result.message);
    setStreetLevel(result.data.streetLevelAvailable);
    setCandidates(result.data.results);
  }

  function applyCandidate(c: GeocodeCandidate) {
    setLatitude(c.point.latitude.toFixed(6));
    setLongitude(c.point.longitude.toFixed(6));
    if (!region && c.address.region) setRegion(c.address.region);
    if (!postalCode && c.address.postalCode) setPostalCode(c.address.postalCode);
    setPositionNote(
      c.precision === 'city'
        ? `Approximate (city centre of ${c.formattedAddress}). For an exact pin, paste the coordinates from your map app.`
        : `Position of ${c.formattedAddress}.`,
    );
    setCandidates(null);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    const errors: Record<string, string> = {};
    if (name.trim().length < 2) errors.name = 'Enter a name for this branch.';
    if (!SLUG_PATTERN.test(slug) || slug.length < 3) errors.slug = 'Use at least 3 lowercase letters, numbers and single hyphens.';
    const anyAddress = [line1, line2, locality, region, postalCode].some((s) => s.trim());
    if (anyAddress && !line1.trim()) errors.line1 = 'Enter the first line of the address.';
    const lat = latitude.trim() ? Number(latitude) : null;
    const lng = longitude.trim() ? Number(longitude) : null;
    if ((lat === null) !== (lng === null)) errors.latitude = 'Enter both latitude and longitude, or neither.';
    if (lat !== null && (Number.isNaN(lat) || lat < -90 || lat > 90)) errors.latitude = 'Latitude is between -90 and 90.';
    if (lng !== null && (Number.isNaN(lng) || lng < -180 || lng > 180)) errors.longitude = 'Longitude is between -180 and 180.';
    if (email.trim() && !email.includes('@')) errors.email = 'Enter a valid email address.';
    const hoursResult = toRows(hours);
    setHoursErrors(hoursResult.errors);
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0 || Object.keys(hoursResult.errors).length > 0 || hoursResult.weekError) {
      if (hoursResult.weekError) setFormError(hoursResult.weekError);
      return;
    }

    setSaving(true);
    const result = await api.post<CreatedLocation>(`/api/v1/organizations/${organizationId}/locations`, {
      name: name.trim(),
      slug,
      timezone,
      isPrimary,
      ...(phone.trim() ? { phone: phone.trim() } : {}),
      ...(email.trim() ? { email: email.trim() } : {}),
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
      ...(hoursResult.rows.length > 0 ? { hours: hoursResult.rows } : {}),
    });
    setSaving(false);
    if (!result.ok) {
      setFormError(result.message);
      setFieldErrors({ ...result.fieldErrors });
      return;
    }
    setCreated(result.data);
    router.refresh();
  }

  if (created) {
    return (
      <Card label="Branch added">
        <CardBody>
          <Alert tone={created.discoverable ? 'success' : 'warning'} title="Branch added">
            {created.discoverable
              ? 'It has a map position, so verified dentists here can appear in distance search.'
              : (created.warning ?? 'It has no map position yet, so it will not appear in distance search.')}
          </Alert>
          <Button variant="secondary" onClick={() => window.location.reload()} style={{ marginBlockStart: 'var(--tl-space-3)' }}>
            Add another branch
          </Button>
        </CardBody>
      </Card>
    );
  }

  const text = (label: string, value: string, set: (v: string) => void, key: string, extra: Record<string, unknown> = {}, hint?: string) => (
    <Field label={label} error={fieldErrors[key]} hint={hint}>
      {(props) => <Input {...props} value={value} onChange={(e) => set(e.target.value)} {...extra} />}
    </Field>
  );

  return (
    <Card label="Add a branch">
      <CardHeader>
        <strong>Add a branch</strong>
      </CardHeader>
      <CardBody>
        <form onSubmit={submit} noValidate className="tl-form">
          {formError ? (
            <Alert tone="danger" title="Could not add the branch">
              {formError}
            </Alert>
          ) : null}

          <div className="tl-form-grid">
            <Field label="Branch name" required error={fieldErrors.name} hint="e.g. Shankar Nagar">
              {(props) => (
                <Input
                  {...props}
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value);
                    if (!slugEdited) setSlug(slugify(e.target.value));
                  }}
                />
              )}
            </Field>
            <Field label="URL name" required error={fieldErrors.slug} hint="Lowercase letters, numbers and hyphens.">
              {(props) => (
                <Input
                  {...props}
                  value={slug}
                  onChange={(e) => {
                    setSlugEdited(true);
                    setSlug(e.target.value.toLowerCase());
                  }}
                />
              )}
            </Field>
          </div>

          <div className="tl-form-grid">
            <Field label="Timezone" required>
              {(props) => (
                <select {...props} className="tl-input" value={timezone} onChange={(e) => setTimezone(e.target.value)}>
                  {timezones.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.label} ({t.id})
                    </option>
                  ))}
                </select>
              )}
            </Field>
            {text('Phone', phone, setPhone, 'phone', { inputMode: 'tel', autoComplete: 'tel' }, 'International format, e.g. +919876543210.')}
            {text('Email', email, setEmail, 'email', { type: 'email', inputMode: 'email' })}
          </div>

          <label className="tl-checkbox">
            <input type="checkbox" checked={isPrimary} onChange={(e) => setIsPrimary(e.target.checked)} />
            <span>Main branch{hasPrimary ? ' (replaces the current main branch)' : ''}</span>
          </label>

          <fieldset className="tl-fieldset">
            <legend className="tl-fieldset__legend">Address</legend>
            {text('Address line 1', line1, setLine1, 'line1', { autoComplete: 'address-line1' })}
            {text('Address line 2', line2, setLine2, 'line2', { autoComplete: 'address-line2' })}
            <div className="tl-form-grid">
              {text('City or locality', locality, setLocality, 'locality', { autoComplete: 'address-level2' })}
              {text('State or region', region, setRegion, 'region', { autoComplete: 'address-level1' })}
              {text('Postal code', postalCode, setPostalCode, 'postalCode', { autoComplete: 'postal-code', inputMode: 'numeric' })}
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
            </div>
          </fieldset>

          <fieldset className="tl-fieldset">
            <legend className="tl-fieldset__legend">Map position</legend>
            <p className="tl-muted" style={{ marginBlockStart: 0 }}>
              Without a map position this branch cannot appear in distance search.
            </p>
            <div className="tl-form-grid">
              {text('Latitude', latitude, setLatitude, 'latitude', { inputMode: 'decimal' }, 'e.g. 21.251400')}
              {text('Longitude', longitude, setLongitude, 'longitude', { inputMode: 'decimal' }, 'e.g. 81.629600')}
            </div>
            <div className="tl-inline">
              <Button size="sm" variant="secondary" loading={looking} onClick={findOnMap}>
                Find on map from the city
              </Button>
            </div>
            {positionNote ? <p className="tl-muted">{positionNote}</p> : null}
            {candidates ? (
              candidates.length === 0 ? (
                <p className="tl-muted">No match for that place. Enter the coordinates from your map app instead.</p>
              ) : (
                <div className="tl-stack">
                  {!streetLevel ? (
                    <p className="tl-muted" style={{ margin: 0 }}>
                      Street-level lookup is not configured, so these are city centres, not your door.
                    </p>
                  ) : null}
                  <ul className="tl-list">
                    {candidates.slice(0, 5).map((c) => (
                      <li key={`${c.point.latitude},${c.point.longitude}`}>
                        <Button size="sm" variant="ghost" onClick={() => applyCandidate(c)}>
                          Use {c.formattedAddress}
                          {c.precision === 'city' ? ' (approximate)' : ''}
                        </Button>
                      </li>
                    ))}
                  </ul>
                </div>
              )
            ) : null}
          </fieldset>

          <HoursEditor idPrefix={`new-${organizationId}`} value={hours} onChange={setHours} errors={hoursErrors} />

          <Button type="submit" loading={saving}>
            Add branch
          </Button>
        </form>
      </CardBody>
    </Card>
  );
}

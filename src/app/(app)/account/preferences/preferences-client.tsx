'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  Alert,
  Button,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  Field,
  Input,
  THEME_STORAGE_KEY,
  applyPresentation,
  storePresentation,
} from '@/design-system';
import { api } from '@/lib/api-client';

interface Prefs {
  locale: string;
  timezone: string;
  countryCode: string;
  currency: string | null;
  theme: 'SYSTEM' | 'LIGHT' | 'DARK';
  palette: string;
  reducedMotion: boolean;
  highContrast: boolean;
  textScale: number;
  quietHours: { start: number; end: number } | null;
  distanceUnit: 'KM' | 'MI';
  defaultSearchRadiusKm: number;
}

interface Place {
  id: string;
  label: string;
  latitude: number;
  longitude: number;
  isDefault: boolean;
}

interface Options {
  languages: Array<{ code: string; label: string }>;
  countries: Array<{ code: string; label: string; enabled: boolean }>;
  currencies: Array<{ code: string; label: string }>;
  timezones: string[];
}

const PALETTES: Array<{ value: string; label: string; swatch: string }> = [
  { value: 'teal', label: 'Teal', swatch: '#0f6d8c' },
  { value: 'indigo', label: 'Indigo', swatch: '#4338ca' },
  { value: 'rose', label: 'Rose', swatch: '#be123c' },
  { value: 'amber', label: 'Amber', swatch: '#b45309' },
  { value: 'slate', label: 'Slate', swatch: '#334155' },
];

const toTime = (minutes: number) =>
  `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
const fromTime = (value: string) => {
  const [h, m] = value.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
};

export function PreferencesClient({ initial, places, options }: { initial: Prefs; places: Place[]; options: Options }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [prefs, setPrefs] = useState<Prefs>(initial);
  const [saving, setSaving] = useState<string | null>(null);
  const [status, setStatus] = useState<{ section: string; tone: 'success' | 'danger'; text: string } | null>(null);

  const save = async (section: string, patch: Partial<Prefs>) => {
    setSaving(section);
    setStatus(null);
    const result = await api.put<Prefs>('/api/v1/me/preferences', patch);
    setSaving(null);
    if (result.ok) {
      setPrefs(result.data);
      setStatus({ section, tone: 'success', text: 'Saved.' });
      startTransition(() => router.refresh());
    } else {
      setStatus({ section, tone: 'danger', text: result.message });
    }
    return result.ok ? result.data : null;
  };

  /** Appearance applies at once, then persists — to the account and this device. */
  const saveAppearance = async (patch: Partial<Prefs>) => {
    const next = { ...prefs, ...patch };
    setPrefs(next);
    const theme = next.theme === 'SYSTEM' ? 'system' : next.theme.toLowerCase();
    try {
      localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
      /* private mode */
    }
    if (theme === 'system') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme', theme);
    const presentation = {
      palette: next.palette as 'teal',
      contrast: next.highContrast ? ('more' as const) : ('normal' as const),
      motion: next.reducedMotion ? ('reduce' as const) : ('normal' as const),
      textScale: next.textScale,
    };
    applyPresentation(presentation);
    storePresentation(presentation);
    await save('appearance', patch);
  };

  const sectionStatus = (section: string) =>
    status?.section === section ? <Alert tone={status.tone}>{status.text}</Alert> : null;

  return (
    <div className="tl-account-stack">
      {/* --- Region & language -------------------------------------------- */}
      <Card label="Region and language">
        <CardHeader>
          <strong>Region and language</strong>
        </CardHeader>
        <CardBody>
          <form
            className="tl-form"
            onSubmit={(e) => {
              e.preventDefault();
              void save('region', {
                locale: prefs.locale,
                timezone: prefs.timezone,
                countryCode: prefs.countryCode,
                currency: prefs.currency,
              });
            }}
          >
            {sectionStatus('region')}
            <div className="tl-form-grid">
              <Field label="Language" hint="The interface is in English today; your choice is used for messages and as translations arrive.">
                {(props) => (
                  <select {...props} className="tl-input" value={prefs.locale} onChange={(e) => setPrefs({ ...prefs, locale: e.target.value })}>
                    {options.languages.map((l) => (
                      <option key={l.code} value={l.code}>
                        {l.label}
                      </option>
                    ))}
                  </select>
                )}
              </Field>
              <Field label="Timezone" hint="Appointment times and reminders are shown in this timezone.">
                {(props) => (
                  <select {...props} className="tl-input" value={prefs.timezone} onChange={(e) => setPrefs({ ...prefs, timezone: e.target.value })}>
                    {options.timezones.map((tz) => (
                      <option key={tz} value={tz}>
                        {tz.replace(/_/g, ' ')}
                      </option>
                    ))}
                  </select>
                )}
              </Field>
              <Field label="Country">
                {(props) => (
                  <select {...props} className="tl-input" value={prefs.countryCode} onChange={(e) => setPrefs({ ...prefs, countryCode: e.target.value })}>
                    {options.countries.map((c) => (
                      <option key={c.code} value={c.code}>
                        {c.label}
                        {c.enabled ? '' : ' (not yet open)'}
                      </option>
                    ))}
                  </select>
                )}
              </Field>
              <Field label="Display currency" hint="Prices are always shown in the clinic’s own currency; conversion is not available yet.">
                {(props) => (
                  <select
                    {...props}
                    className="tl-input"
                    value={prefs.currency ?? ''}
                    onChange={(e) => setPrefs({ ...prefs, currency: e.target.value || null })}
                  >
                    <option value="">My country’s currency</option>
                    {options.currencies.map((c) => (
                      <option key={c.code} value={c.code}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                )}
              </Field>
            </div>
            <div>
              <Button type="submit" loading={saving === 'region'}>
                Save region and language
              </Button>
            </div>
          </form>
        </CardBody>
      </Card>

      {/* --- Appearance & accessibility ------------------------------------ */}
      <Card label="Appearance and accessibility">
        <CardHeader>
          <strong>Appearance and accessibility</strong>
        </CardHeader>
        <CardBody>
          <div className="tl-form">
            {sectionStatus('appearance')}
            <fieldset className="tl-fieldset">
              <legend className="tl-fieldset__legend">Theme</legend>
              <div className="tl-choice-grid">
                {(['SYSTEM', 'LIGHT', 'DARK'] as const).map((theme) => (
                  <label key={theme} className={`tl-choice${prefs.theme === theme ? ' tl-choice--selected' : ''}`}>
                    <input type="radio" name="theme" checked={prefs.theme === theme} onChange={() => void saveAppearance({ theme })} />
                    <span className="tl-choice__label">{theme === 'SYSTEM' ? 'Match my device' : theme === 'LIGHT' ? 'Light' : 'Dark'}</span>
                  </label>
                ))}
              </div>
            </fieldset>

            <fieldset className="tl-fieldset">
              <legend className="tl-fieldset__legend">Colour</legend>
              <div className="tl-choice-grid">
                {PALETTES.map((p) => (
                  <label key={p.value} className={`tl-choice tl-choice--swatch${prefs.palette === p.value ? ' tl-choice--selected' : ''}`}>
                    <input type="radio" name="palette" checked={prefs.palette === p.value} onChange={() => void saveAppearance({ palette: p.value })} />
                    <span className="tl-swatch-dot" style={{ background: p.swatch }} aria-hidden="true" />
                    <span className="tl-choice__label">{p.label}</span>
                  </label>
                ))}
              </div>
            </fieldset>

            <label className="tl-checkbox">
              <input type="checkbox" checked={prefs.highContrast} onChange={(e) => void saveAppearance({ highContrast: e.target.checked })} />
              <span>
                <strong>Higher contrast</strong> — darker text and firmer borders
              </span>
            </label>
            <label className="tl-checkbox">
              <input type="checkbox" checked={prefs.reducedMotion} onChange={(e) => void saveAppearance({ reducedMotion: e.target.checked })} />
              <span>
                <strong>Reduce motion</strong> — no animations or transitions
              </span>
            </label>

            <Field label="Text size">
              {(props) => (
                <select {...props} className="tl-input" value={prefs.textScale} onChange={(e) => void saveAppearance({ textScale: Number(e.target.value) })}>
                  {[90, 100, 110, 125, 150].map((s) => (
                    <option key={s} value={s}>
                      {s === 100 ? 'Default' : `${s}%`}
                    </option>
                  ))}
                </select>
              )}
            </Field>
          </div>
        </CardBody>
      </Card>

      {/* --- Quiet hours ----------------------------------------------------- */}
      <QuietHoursCard prefs={prefs} saving={saving === 'quiet'} status={sectionStatus('quiet')} onSave={(q) => save('quiet', { quietHours: q })} />

      {/* --- Search defaults ------------------------------------------------ */}
      <Card label="Search defaults">
        <CardHeader>
          <strong>Search defaults</strong>
        </CardHeader>
        <CardBody>
          <form
            className="tl-form"
            onSubmit={(e) => {
              e.preventDefault();
              void save('search', { defaultSearchRadiusKm: prefs.defaultSearchRadiusKm, distanceUnit: prefs.distanceUnit });
            }}
          >
            {sectionStatus('search')}
            <div className="tl-form-grid">
              <Field label="Search within (km)">
                {(props) => (
                  <Input
                    {...props}
                    type="number"
                    min={1}
                    max={200}
                    value={prefs.defaultSearchRadiusKm}
                    onChange={(e) => setPrefs({ ...prefs, defaultSearchRadiusKm: Number(e.target.value) })}
                  />
                )}
              </Field>
              <Field label="Show distances in">
                {(props) => (
                  <select {...props} className="tl-input" value={prefs.distanceUnit} onChange={(e) => setPrefs({ ...prefs, distanceUnit: e.target.value as 'KM' | 'MI' })}>
                    <option value="KM">Kilometres</option>
                    <option value="MI">Miles</option>
                  </select>
                )}
              </Field>
            </div>
            <div>
              <Button type="submit" loading={saving === 'search'}>
                Save search defaults
              </Button>
            </div>
          </form>
        </CardBody>
      </Card>

      <SavedPlacesCard places={places} onChange={() => startTransition(() => router.refresh())} />
    </div>
  );
}

function QuietHoursCard({
  prefs,
  saving,
  status,
  onSave,
}: {
  prefs: Prefs;
  saving: boolean;
  status: React.ReactNode;
  onSave: (q: { start: number; end: number } | null) => void;
}) {
  const [enabled, setEnabled] = useState(prefs.quietHours !== null);
  const [start, setStart] = useState(toTime(prefs.quietHours?.start ?? 22 * 60));
  const [end, setEnd] = useState(toTime(prefs.quietHours?.end ?? 7 * 60));

  return (
    <Card label="Quiet hours">
      <CardHeader>
        <strong>Quiet hours</strong>
      </CardHeader>
      <CardBody>
        <form
          className="tl-form"
          onSubmit={(e) => {
            e.preventDefault();
            onSave(enabled ? { start: fromTime(start), end: fromTime(end) } : null);
          }}
        >
          {status}
          <p className="tl-muted" style={{ margin: 0 }}>
            Reminders by SMS, WhatsApp and push wait until quiet hours end. Security alerts and changes to today’s
            appointments still come through.
          </p>
          <label className="tl-checkbox">
            <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
            <span>Use quiet hours</span>
          </label>
          {enabled ? (
            <div className="tl-form-grid">
              <Field label="From">{(props) => <Input {...props} type="time" value={start} onChange={(e) => setStart(e.target.value)} />}</Field>
              <Field label="Until">{(props) => <Input {...props} type="time" value={end} onChange={(e) => setEnd(e.target.value)} />}</Field>
            </div>
          ) : null}
          <div>
            <Button type="submit" loading={saving}>
              Save quiet hours
            </Button>
          </div>
        </form>
      </CardBody>
    </Card>
  );
}

function SavedPlacesCard({ places, onChange }: { places: Place[]; onChange: () => void }) {
  const [query, setQuery] = useState('');
  const [label, setLabel] = useState('Home');
  const [results, setResults] = useState<Array<{ formattedAddress: string; point: { latitude: number; longitude: number } }> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const search = async () => {
    setError(null);
    const r = await api.get<{ results: Array<{ formattedAddress: string; point: { latitude: number; longitude: number } }> }>(
      `/api/v1/geo/geocode?q=${encodeURIComponent(query)}`,
    );
    if (r.ok) setResults(r.data.results);
    else setError(r.message);
  };

  const add = async (latitude: number, longitude: number) => {
    setBusy(true);
    const r = await api.post('/api/v1/me/locations', { label: label.trim() || 'Place', latitude, longitude });
    setBusy(false);
    if (r.ok) {
      setResults(null);
      setQuery('');
      onChange();
    } else setError(r.message);
  };

  const useGps = () => {
    if (!('geolocation' in navigator)) {
      setError('This browser cannot share its location.');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => void add(Number(pos.coords.latitude.toFixed(6)), Number(pos.coords.longitude.toFixed(6))),
      () => setError('Location permission was not given. You can search for a place instead.'),
      { enableHighAccuracy: false, timeout: 10_000 },
    );
  };

  const remove = async (id: string) => {
    const r = await api.delete(`/api/v1/me/locations?id=${encodeURIComponent(id)}`);
    if (r.ok) onChange();
    else setError(r.message);
  };

  return (
    <Card label="Saved places">
      <CardHeader>
        <strong>Saved places</strong>
      </CardHeader>
      <CardBody>
        <p className="tl-muted" style={{ marginBlockStart: 0 }}>
          Search for dentists near home or work without sharing your live location.
        </p>
        {error ? <Alert tone="danger">{error}</Alert> : null}
        {places.length === 0 ? (
          <EmptyState title="No saved places" description="Add one below." />
        ) : (
          <ul className="tl-list">
            {places.map((p) => (
              <li key={p.id} className="tl-list__row">
                <span>
                  <strong>{p.label}</strong>
                  {p.isDefault ? <span className="tl-list__meta"> · default</span> : null}
                </span>
                <Button variant="ghost" size="sm" onClick={() => void remove(p.id)} aria-label={`Remove ${p.label}`}>
                  Remove
                </Button>
              </li>
            ))}
          </ul>
        )}

        <div className="tl-form" style={{ marginBlockStart: 'var(--tl-space-4)' }}>
          <div className="tl-form-grid">
            <Field label="Name this place">{(props) => <Input {...props} value={label} onChange={(e) => setLabel(e.target.value)} maxLength={60} />}</Field>
            <Field label="City" hint="City-level: we save the city centre, not a street address.">
              {(props) => (
                <Input
                  {...props}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      void search();
                    }
                  }}
                />
              )}
            </Field>
          </div>
          <div className="tl-inline">
            <Button variant="secondary" size="sm" disabled={query.trim().length < 2} onClick={() => void search()}>
              Find city
            </Button>
            <Button variant="ghost" size="sm" loading={busy} onClick={useGps}>
              Use my current location
            </Button>
          </div>
          {results ? (
            results.length === 0 ? (
              <p className="tl-muted">No matching city in our list yet.</p>
            ) : (
              <ul className="tl-list">
                {results.map((r) => (
                  <li key={r.formattedAddress} className="tl-list__row">
                    <span>{r.formattedAddress}</span>
                    <Button size="sm" onClick={() => void add(r.point.latitude, r.point.longitude)}>
                      Save
                    </Button>
                  </li>
                ))}
              </ul>
            )
          ) : null}
        </div>
      </CardBody>
    </Card>
  );
}

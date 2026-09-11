/**
 * Create a Prime campaign, with a live preview of the Sponsored result and the
 * budget arithmetic. Creates a draft; activation (and the wallet hold) happens
 * on the campaign's own page. The server re-checks everything.
 */

'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Alert, Button, Card, CardBody, CardHeader, Field, Input } from '@/design-system';
import { api, newIdempotencyKey } from '@/lib/api-client';
import { SponsoredCard } from '@/components/sponsored/sponsored-card';

export interface CampaignSubjectOption {
  readonly value: string; // 'ORGANIZATION' or a practice id
  readonly tier: string;
  readonly title: string;
  readonly subtitle: string;
  readonly hasLocation: boolean;
}

const TYPES = [
  ['CLINIC', 'Clinic visits'],
  ['VIDEO', 'Video consultations'],
  ['HOME_VISIT', 'Home visits'],
] as const;

function addDaysTo(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
function daysInclusive(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000) + 1;
}

export function CampaignForm({
  organizationId,
  subjects,
  treatments,
  minimumDailyMinor,
  currency,
  today,
  taxPercent,
}: {
  organizationId: string;
  subjects: readonly CampaignSubjectOption[];
  treatments: ReadonlyArray<{ key: string; name: string }>;
  minimumDailyMinor: string;
  currency: string;
  today: string;
  taxPercent: number;
}) {
  const router = useRouter();
  const format = (major: number) => new Intl.NumberFormat('en-IN', { style: 'currency', currency }).format(major);
  const minDaily = Number(minimumDailyMinor) / 100;
  const [name, setName] = useState('');
  const [subject, setSubject] = useState(subjects[0]!.value);
  const [search, setSearch] = useState(true);
  const [profile, setProfile] = useState(false);
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(addDaysTo(today, 6));
  const [budget, setBudget] = useState(String(minDaily * 7));
  const [chosenTreatments, setChosenTreatments] = useState<string[]>([]);
  const [types, setTypes] = useState<string[]>([]);
  const [radius, setRadius] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const key = useRef<string | null>(null);

  const option = subjects.find((s) => s.value === subject) ?? subjects[0]!;
  const days = endDate >= startDate ? daysInclusive(startDate, endDate) : 0;
  const budgetMajor = Number(budget);
  const minimum = minDaily * Math.max(days, 1);
  const perDay = days > 0 && Number.isFinite(budgetMajor) ? budgetMajor / days : 0;

  async function create() {
    setError(null);
    if (name.trim().length < 3) return setError('Name the campaign.');
    if (days < 1) return setError('The end date must be on or after the start date.');
    if (!Number.isFinite(budgetMajor) || budgetMajor < minimum) return setError(`The budget must be at least ${format(minimum)} for ${days} day${days === 1 ? '' : 's'}.`);
    if (!search && !profile) return setError('Choose at least one placement.');
    key.current ??= newIdempotencyKey();
    setBusy(true);
    const result = await api.post<{ campaign: { id: string } }>(
      `/api/v1/organizations/${organizationId}/campaigns`,
      {
        name: name.trim(),
        subjectType: subject === 'ORGANIZATION' ? 'ORGANIZATION' : 'PRACTICE',
        practiceId: subject === 'ORGANIZATION' ? null : subject,
        searchPlacement: search,
        profilePlacement: profile,
        startDate,
        endDate,
        budgetMinor: String(Math.round(budgetMajor * 100)),
        targetTreatmentKeys: chosenTreatments,
        targetAppointmentTypes: types,
        targetRadiusKm: radius ? Number(radius) : null,
      },
      { idempotencyKey: key.current },
    );
    setBusy(false);
    if (!result.ok) {
      key.current = null;
      return setError(result.message);
    }
    router.push(`/account/organizations/${organizationId}/campaigns/${result.data.campaign.id}`);
  }

  return (
    <Card label="New campaign">
      <CardHeader>
        <strong>New campaign</strong>
      </CardHeader>
      <CardBody>
        <div className="tl-stack">
          {error ? (
            <Alert tone="danger" title="Not created">
              {error}
            </Alert>
          ) : null}
          <Field label="Campaign name" required>
            {(props) => <Input {...props} value={name} maxLength={120} onChange={(e) => setName(e.target.value)} placeholder="e.g. Implants — Raipur, October" />}
          </Field>

          <fieldset className="tl-fieldset">
            <legend className="tl-fieldset__legend">What to promote</legend>
            {subjects.map((s) => (
              <label key={s.value} className="tl-checkbox">
                <input type="radio" name="subject" checked={subject === s.value} onChange={() => setSubject(s.value)} />
                <span>
                  <strong>{s.tier}</strong>: {s.title}
                </span>
              </label>
            ))}
          </fieldset>

          <fieldset className="tl-fieldset">
            <legend className="tl-fieldset__legend">Where it appears</legend>
            <label className="tl-checkbox">
              <input type="checkbox" checked={search} onChange={(e) => setSearch(e.target.checked)} />
              <span>Sponsored slot above search results</span>
            </label>
            <label className="tl-checkbox">
              <input type="checkbox" checked={profile} onChange={(e) => setProfile(e.target.checked)} />
              <span>Sponsored slot on other dentists’ and clinics’ profiles nearby</span>
            </label>
          </fieldset>

          <div className="tl-form-grid">
            <Field label="Starts">
              {(props) => <Input {...props} type="date" min={today} value={startDate} onChange={(e) => setStartDate(e.target.value)} />}
            </Field>
            <Field label="Ends (last day)">
              {(props) => <Input {...props} type="date" min={startDate} value={endDate} onChange={(e) => setEndDate(e.target.value)} />}
            </Field>
            <Field label={`Total budget (${currency}, GST ${taxPercent}% included)`} hint={`At least ${format(minimum)} for ${Math.max(days, 1)} day${days === 1 ? '' : 's'}.`}>
              {(props) => <Input {...props} inputMode="decimal" value={budget} onChange={(e) => setBudget(e.target.value)} />}
            </Field>
            <Field label="Show to searches within">
              {(props) => (
                <select {...props} className="tl-input" value={radius} onChange={(e) => setRadius(e.target.value)} disabled={!option.hasLocation}>
                  <option value="">Anywhere</option>
                  {[5, 10, 25, 50].map((km) => (
                    <option key={km} value={km}>
                      {km} km of the branch
                    </option>
                  ))}
                </select>
              )}
            </Field>
          </div>

          <fieldset className="tl-fieldset">
            <legend className="tl-fieldset__legend">Appointment types (none ticked: any)</legend>
            {TYPES.map(([value, label]) => (
              <label key={value} className="tl-checkbox">
                <input type="checkbox" checked={types.includes(value)} onChange={(e) => setTypes((t) => (e.target.checked ? [...t, value] : t.filter((x) => x !== value)))} />
                <span>{label}</span>
              </label>
            ))}
          </fieldset>

          <Field label="Only for searches about these treatments (none selected: any search)" hint="Hold Ctrl or ⌘ to choose several.">
            {(props) => (
              <select
                {...props}
                multiple
                size={6}
                className="tl-input"
                value={chosenTreatments}
                onChange={(e) => setChosenTreatments(Array.from(e.target.selectedOptions).map((o) => o.value))}
              >
                {treatments.map((t) => (
                  <option key={t.key} value={t.key}>
                    {t.name}
                  </option>
                ))}
              </select>
            )}
          </Field>

          <div className="tl-stack">
            <strong>Preview</strong>
            <SponsoredCard slot={{ tier: option.tier, title: option.title, subtitle: option.subtitle, href: '#', next: null }} preview />
            <p className="tl-muted" style={{ margin: 0 }}>
              {days > 0 ? `${days} day${days === 1 ? '' : 's'} · about ${format(perDay)} a day, GST included.` : 'Choose valid dates.'} Shown only while a
              free time can be booked, and only for searches matching your targeting.
            </p>
          </div>

          <div>
            <Button loading={busy} onClick={create}>
              Create draft
            </Button>
          </div>
        </div>
      </CardBody>
    </Card>
  );
}

/**
 * Services and prices.
 *
 * Treatments come from the catalogue — a clinic cannot invent "laser magic
 * whitening" — and prices are entered in the organization's currency. "Price
 * on consultation" is a real answer, recorded as no price rather than zero, so
 * a patient is never shown ₹0 for a root canal.
 *
 * Rules the server enforces (video only for consultations, home visits only
 * where a home-visit area is set, one active price per treatment per branch)
 * come back as the error message shown above the form.
 */

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Alert, Badge, Button, EmptyState, Field, Input, Table } from '@/design-system';
import { api } from '@/lib/api-client';
import { useForm } from '@/components/forms/use-form';

export interface ServiceRow {
  readonly id: string;
  readonly name: string;
  readonly locationName: string;
  readonly dentistName: string | null;
  readonly priceLabel: string;
  readonly durationMinutes: number | null;
  readonly appointmentTypes: readonly string[];
  readonly requiresConsultation: boolean;
  readonly isActive: boolean;
}

export interface TreatmentOption {
  readonly key: string;
  readonly name: string;
  readonly categoryLabel: string;
}

export interface LocationOption {
  readonly id: string;
  readonly name: string;
  readonly homeVisit: boolean;
}

const TYPE_LABELS: Record<string, string> = { CLINIC: 'In clinic', VIDEO: 'Video', HOME_VISIT: 'Home visit' };

/** "1,250.50" → 125050 for a 2-decimal currency. Null when not a valid amount. */
function toMinor(text: string, fractionDigits: number): number | null {
  const cleaned = text.replace(/,/g, '').trim();
  const pattern = fractionDigits > 0 ? new RegExp(`^\\d+(\\.\\d{1,${fractionDigits}})?$`) : /^\d+$/;
  if (!pattern.test(cleaned)) return null;
  return Math.round(Number(cleaned) * 10 ** fractionDigits);
}

export function ServicesPanel({
  organizationId,
  currency,
  fractionDigits,
  services,
  treatments,
  locations,
  canManage,
}: {
  organizationId: string;
  currency: string;
  fractionDigits: number;
  services: readonly ServiceRow[];
  treatments: readonly TreatmentOption[];
  locations: readonly LocationOption[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [toggling, setToggling] = useState<string | null>(null);
  const [rowError, setRowError] = useState<string | null>(null);
  const [added, setAdded] = useState(false);

  const form = useForm({
    initialValues: {
      locationId: locations[0]?.id ?? '',
      treatmentKey: '',
      price: '',
      priceMax: '',
      onConsultation: false,
      duration: '',
      clinic: true,
      video: false,
      home: false,
      requiresConsultation: false,
    },
    validate: (v) => {
      const errors: Partial<Record<string, string>> = {};
      if (!v.locationId) errors.locationId = 'Choose a branch.';
      if (!v.treatmentKey) errors.treatmentKey = 'Choose a treatment.';
      if (!v.onConsultation) {
        if (toMinor(v.price, fractionDigits) === null) errors.price = `Enter a price in ${currency}, e.g. 500.`;
        if (v.priceMax && toMinor(v.priceMax, fractionDigits) === null) errors.priceMax = 'Enter an amount, or leave empty.';
      }
      if (v.duration && !/^\d+$/.test(v.duration)) errors.duration = 'Enter minutes, e.g. 30.';
      if (!v.clinic && !v.video && !v.home) errors.clinic = 'Choose at least one way to be seen.';
      return errors;
    },
    submit: (v) =>
      api.post(`/api/v1/organizations/${organizationId}/services`, {
        locationId: v.locationId,
        treatmentKey: v.treatmentKey,
        priceMinor: v.onConsultation ? null : toMinor(v.price, fractionDigits),
        priceMaxMinor: v.onConsultation || !v.priceMax ? null : toMinor(v.priceMax, fractionDigits),
        durationMinutes: v.duration ? Number(v.duration) : undefined,
        appointmentTypes: [v.clinic && 'CLINIC', v.video && 'VIDEO', v.home && 'HOME_VISIT'].filter(Boolean),
        requiresConsultation: v.requiresConsultation,
      }),
    onSuccess: () => {
      setAdded(true);
      form.reset();
      router.refresh();
    },
  });

  async function toggle(row: ServiceRow) {
    setToggling(row.id);
    setRowError(null);
    const result = await api.patch(
      `/api/v1/organizations/${organizationId}/services?offeringId=${encodeURIComponent(row.id)}`,
      { isActive: !row.isActive },
    );
    setToggling(null);
    if (!result.ok) return setRowError(result.message);
    router.refresh();
  }

  const selectedLocation = locations.find((l) => l.id === form.values.locationId);

  return (
    <div className="tl-stack">
      {rowError ? (
        <Alert tone="danger" title="That change was not made">
          {rowError}
        </Alert>
      ) : null}

      {services.length === 0 ? (
        <EmptyState
          title="No services listed yet"
          description="List the treatments you offer, with a price or “price on consultation”, so patients know what to expect before they book."
        />
      ) : (
        <Table caption="Services and prices">
          <thead>
            <tr>
              <th scope="col">Treatment</th>
              <th scope="col">Branch</th>
              <th scope="col">Price</th>
              <th scope="col">Duration</th>
              <th scope="col">Seen</th>
              {canManage ? <th scope="col">Status</th> : null}
            </tr>
          </thead>
          <tbody>
            {services.map((s) => (
              <tr key={s.id}>
                <td>
                  {s.name}
                  {s.dentistName ? <span className="tl-list__meta"> with {s.dentistName}</span> : null}
                  {s.requiresConsultation ? <span className="tl-list__meta"> · consultation first</span> : null}
                </td>
                <td>{s.locationName}</td>
                <td>{s.priceLabel}</td>
                <td>{s.durationMinutes ? `${s.durationMinutes} min` : '—'}</td>
                <td>{s.appointmentTypes.map((t) => TYPE_LABELS[t] ?? t).join(', ')}</td>
                {canManage ? (
                  <td>
                    <span className="tl-inline">
                      {s.isActive ? <Badge tone="success">Listed</Badge> : <Badge tone="neutral">Hidden</Badge>}
                      <Button size="sm" variant="ghost" loading={toggling === s.id} onClick={() => toggle(s)}>
                        {s.isActive ? 'Hide' : 'List again'}
                      </Button>
                    </span>
                  </td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </Table>
      )}

      {canManage && locations.length > 0 ? (
        <form onSubmit={form.handleSubmit} noValidate className="tl-form">
          <h3 style={{ margin: 0 }}>Add a service</h3>
          {added && !form.formError ? (
            <Alert tone="success" title="Service added">
              It now shows on this branch’s public page.
            </Alert>
          ) : null}
          {form.formError ? (
            <Alert tone="danger" title="Could not add the service">
              {form.formError}
            </Alert>
          ) : null}

          <div className="tl-form-grid">
            <Field label="Branch" required error={form.fieldErrors.locationId}>
              {(props) => (
                <select
                  {...props}
                  className="tl-input"
                  value={form.values.locationId}
                  onChange={(e) => form.setValue('locationId', e.target.value)}
                >
                  {locations.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name}
                    </option>
                  ))}
                </select>
              )}
            </Field>
            <Field label="Treatment" required error={form.fieldErrors.treatmentKey}>
              {(props) => (
                <select
                  {...props}
                  className="tl-input"
                  value={form.values.treatmentKey}
                  onChange={(e) => form.setValue('treatmentKey', e.target.value)}
                >
                  <option value="">Choose…</option>
                  {treatments.map((t) => (
                    <option key={t.key} value={t.key}>
                      {t.name} — {t.categoryLabel}
                    </option>
                  ))}
                </select>
              )}
            </Field>
          </div>

          <label className="tl-checkbox">
            <input
              type="checkbox"
              checked={form.values.onConsultation}
              onChange={(e) => form.setValue('onConsultation', e.target.checked)}
            />
            <span>Price on consultation — the fee depends on examination</span>
          </label>

          {!form.values.onConsultation ? (
            <div className="tl-form-grid">
              <Field label={`Price (${currency})`} required hint="The starting price." error={form.fieldErrors.price}>
                {(props) => (
                  <Input
                    {...props}
                    inputMode="decimal"
                    value={form.values.price}
                    onChange={(e) => form.setValue('price', e.target.value)}
                  />
                )}
              </Field>
              <Field label={`Up to (${currency})`} hint="Optional, for a price range." error={form.fieldErrors.priceMax}>
                {(props) => (
                  <Input
                    {...props}
                    inputMode="decimal"
                    value={form.values.priceMax}
                    onChange={(e) => form.setValue('priceMax', e.target.value)}
                  />
                )}
              </Field>
            </div>
          ) : null}

          <Field label="Duration (minutes)" hint="Leave empty to use the typical duration for this treatment." error={form.fieldErrors.duration}>
            {(props) => (
              <Input
                {...props}
                inputMode="numeric"
                value={form.values.duration}
                onChange={(e) => form.setValue('duration', e.target.value)}
              />
            )}
          </Field>

          <fieldset className="tl-fieldset">
            <legend className="tl-fieldset__legend">How patients can be seen</legend>
            <label className="tl-checkbox">
              <input type="checkbox" checked={form.values.clinic} onChange={(e) => form.setValue('clinic', e.target.checked)} />
              <span>In clinic</span>
            </label>
            <label className="tl-checkbox">
              <input type="checkbox" checked={form.values.video} onChange={(e) => form.setValue('video', e.target.checked)} />
              <span>Video — consultations, second opinions and emergency triage only</span>
            </label>
            <label className="tl-checkbox">
              <input
                type="checkbox"
                checked={form.values.home}
                disabled={!selectedLocation?.homeVisit}
                onChange={(e) => form.setValue('home', e.target.checked)}
              />
              <span>
                Home visit
                {!selectedLocation?.homeVisit ? ' — set a home-visit area for this branch first' : ''}
              </span>
            </label>
            {form.fieldErrors.clinic ? <p className="tl-field__error">{form.fieldErrors.clinic}</p> : null}
          </fieldset>

          <label className="tl-checkbox">
            <input
              type="checkbox"
              checked={form.values.requiresConsultation}
              onChange={(e) => form.setValue('requiresConsultation', e.target.checked)}
            />
            <span>Needs a consultation before this can be booked</span>
          </label>

          <Button type="submit" loading={form.submitting}>
            Add service
          </Button>
        </form>
      ) : null}
    </div>
  );
}

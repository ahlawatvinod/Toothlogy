/**
 * Create-organization form.
 *
 * The slug is auto-derived from the name but remains editable. Deriving it
 * silently and hiding it would mean the practice discovers its public URL only
 * after it is fixed; making the user invent one from scratch is friction for
 * something we can guess correctly nine times in ten.
 *
 * Once the user edits the slug by hand, typing in the name no longer overwrites
 * it — an auto-updater that clobbers a deliberate choice is worse than none.
 */

'use client';

import { useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Alert, Button, Field, Input } from '@/design-system';
import { api } from '@/lib/api-client';
import { useForm } from '@/components/forms/use-form';

const TYPES = [
  { value: 'CLINIC', label: 'Dental clinic' },
  { value: 'HOSPITAL', label: 'Hospital' },
  { value: 'COLLEGE', label: 'Dental college' },
  { value: 'SUPPLIER', label: 'Supplier' },
  { value: 'MANUFACTURER', label: 'Manufacturer' },
  { value: 'DISTRIBUTOR', label: 'Distributor' },
  { value: 'EMPLOYER', label: 'Employer' },
] as const;

/** Mirrors the server's slug rules so the user gets a valid suggestion. */
function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

export function NewOrganizationForm({
  countries,
}: {
  countries: ReadonlyArray<{ code: string; name: string; defaultTimezone: string }>;
}) {
  const router = useRouter();
  const slugEditedByHand = useRef(false);

  const form = useForm({
    initialValues: {
      name: '',
      slug: '',
      type: 'CLINIC' as string,
      countryCode: countries[0]?.code ?? 'IN',
      timezone: countries[0]?.defaultTimezone ?? 'Asia/Kolkata',
    },

    validate: (values) => {
      const errors: Record<string, string> = {};
      if (values.name.trim().length < 2) errors.name = 'Enter the organization name.';
      if (values.slug.length < 3) errors.slug = 'Use at least 3 characters.';
      else if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(values.slug)) {
        errors.slug = 'Use lowercase letters, numbers and single hyphens only.';
      }
      return errors;
    },

    submit: (values) =>
      api.post<{ organizationId: string }>('/api/v1/organizations', {
        name: values.name.trim(),
        slug: values.slug,
        type: values.type,
        countryCode: values.countryCode,
        timezone: values.timezone,
      }),

    onSuccess: (data) => {
      router.push(`/account/organizations/${data.organizationId}`);
      router.refresh();
    },
  });

  return (
    <form onSubmit={form.handleSubmit} noValidate className="tl-form">
      {form.formError ? (
        <Alert tone="danger" title="Could not create the organization">
          {form.formError}
        </Alert>
      ) : null}

      <Field label="Organization name" required error={form.fieldErrors.name}>
        {(props) => (
          <Input
            {...props}
            autoFocus
            placeholder="Smile Dental Care"
            value={form.values.name}
            onChange={(e) => {
              form.setValue('name', e.target.value);
              if (!slugEditedByHand.current) form.setValue('slug', slugify(e.target.value));
            }}
          />
        )}
      </Field>

      <Field
        label="Public URL name"
        required
        hint="This appears in your public address. Lowercase letters, numbers and hyphens."
        error={form.fieldErrors.slug}
      >
        {(props) => (
          <Input
            {...props}
            value={form.values.slug}
            onChange={(e) => {
              slugEditedByHand.current = true;
              form.setValue('slug', e.target.value.toLowerCase());
            }}
          />
        )}
      </Field>

      <Field label="Type" required>
        {(props) => (
          <select
            {...props}
            className="tl-input"
            value={form.values.type}
            onChange={(e) => form.setValue('type', e.target.value)}
          >
            {TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        )}
      </Field>

      <Field
        label="Country"
        required
        hint="Determines currency, tax rules and address format."
        error={form.fieldErrors.countryCode}
      >
        {(props) => (
          <select
            {...props}
            className="tl-input"
            value={form.values.countryCode}
            onChange={(e) => {
              form.setValue('countryCode', e.target.value);
              // Keep the timezone consistent with the chosen country so the
              // common case needs no second decision.
              const country = countries.find((c) => c.code === e.target.value);
              if (country) form.setValue('timezone', country.defaultTimezone);
            }}
          >
            {countries.map((c) => (
              <option key={c.code} value={c.code}>
                {c.name}
              </option>
            ))}
          </select>
        )}
      </Field>

      <Alert tone="info">
        Your organization will not be publicly discoverable until it has been verified.
      </Alert>

      <Button type="submit" size="lg" loading={form.submitting}>
        Create organization
      </Button>
    </form>
  );
}

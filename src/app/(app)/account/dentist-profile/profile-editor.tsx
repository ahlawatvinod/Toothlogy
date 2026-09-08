/**
 * Dentist profile editor.
 *
 * The screen where a dentist becomes findable. Its most important job is not
 * collecting fields — it is telling the dentist, at every moment, WHY they are
 * or are not appearing in patient search.
 *
 * A practice that has filled in a profile and hears nothing concludes the
 * platform has no patients. The status panel here answers that question
 * directly: verified or not, practice confirmed or not, and what to do next.
 */

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Alert,
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  Field,
  Input,
} from '@/design-system';
import { api } from '@/lib/api-client';
import { useForm } from '@/components/forms/use-form';

export interface Specialty {
  key: string;
  name: string;
  description: string;
}

export interface DentistProfileData {
  id: string;
  slug: string;
  headline: string | null;
  bio: string | null;
  practisingSince: number | null;
  languages: string[];
  consultationFeeMinor: number | null;
  consultationCurrency: string | null;
  status: string;
  isVerified: boolean;
  isDiscoverable: boolean;
  qualifications: Array<{
    id: string;
    degree: string;
    institution: string;
    year: number;
    registrationNumber: string | null;
    isVerified: boolean;
  }>;
  specialties: Array<{ key: string; name: string; isPrimary: boolean }>;
  practices: Array<{ id: string; locationId: string; isConfirmed: boolean }>;
  verificationHistory: Array<{
    id: string;
    status: string;
    submittedAt: string;
    reviewedAt: string | null;
    decisionReason: string | null;
  }>;
}

const LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'hi', label: 'Hindi' },
  { code: 'bn', label: 'Bengali' },
  { code: 'mr', label: 'Marathi' },
  { code: 'ta', label: 'Tamil' },
  { code: 'te', label: 'Telugu' },
  { code: 'gu', label: 'Gujarati' },
  { code: 'kn', label: 'Kannada' },
  { code: 'ml', label: 'Malayalam' },
  { code: 'pa', label: 'Punjabi' },
];

const MIN_BIO_LENGTH = 40;

export function ProfileEditor({
  profile,
  specialties,
}: {
  profile: DentistProfileData | null;
  specialties: readonly Specialty[];
}) {
  const router = useRouter();
  const [notice, setNotice] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const form = useForm({
    initialValues: {
      slug: profile?.slug ?? '',
      headline: profile?.headline ?? '',
      bio: profile?.bio ?? '',
      practisingSince: profile?.practisingSince?.toString() ?? '',
      languages: profile?.languages ?? ['en'],
      specialtyKeys: profile?.specialties.map((s) => s.key) ?? [],
      consultationFee: profile?.consultationFeeMinor
        ? (profile.consultationFeeMinor / 100).toString()
        : '',
    },

    validate: (values) => {
      const errors: Record<string, string> = {};
      if (values.slug.length < 3) errors.slug = 'Use at least 3 characters.';
      else if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(values.slug)) {
        errors.slug = 'Use lowercase letters, numbers and single hyphens only.';
      }
      if (values.bio && values.bio.trim().length > 0 && values.bio.trim().length < MIN_BIO_LENGTH) {
        errors.bio = `Verification needs at least ${MIN_BIO_LENGTH} characters.`;
      }
      if (values.practisingSince) {
        const year = Number(values.practisingSince);
        if (!Number.isInteger(year) || year < 1900 || year > new Date().getFullYear()) {
          errors.practisingSince = 'Enter a valid year.';
        }
      }
      if (values.consultationFee && Number.isNaN(Number(values.consultationFee))) {
        errors.consultationFee = 'Enter a number.';
      }
      return errors;
    },

    submit: (values) =>
      api.put('/api/v1/dentists/me', {
        slug: values.slug,
        headline: values.headline || undefined,
        bio: values.bio || undefined,
        practisingSince: values.practisingSince ? Number(values.practisingSince) : undefined,
        languages: values.languages,
        specialtyKeys: values.specialtyKeys,
        // Rupees to paise. Money crosses the wire in minor units so no float
        // rounding happens anywhere (Constitution §4).
        consultationFeeMinor: values.consultationFee
          ? Math.round(Number(values.consultationFee) * 100)
          : undefined,
        consultationCurrency: values.consultationFee ? 'INR' : undefined,
      }),

    onSuccess: () => {
      setNotice('Your profile has been saved.');
      router.refresh();
    },
  });

  const toggle = (list: string[], value: string) =>
    list.includes(value) ? list.filter((v) => v !== value) : [...list, value];

  const submitForReview = async () => {
    setSubmitError(null);
    const result = await api.post('/api/v1/dentists/me/submit');
    if (result.ok) {
      setNotice('Submitted for verification.');
      router.refresh();
    } else {
      setSubmitError(result.message);
    }
  };

  const confirmedPractices = profile?.practices.filter((p) => p.isConfirmed).length ?? 0;

  return (
    <div className="tl-stack">
      {notice ? <Alert tone="success">{notice}</Alert> : null}

      {/*
       * The status panel. Every negative state names the specific missing
       * condition, because "you are not appearing in search" without a reason
       * is the single most frustrating message this product could show.
       */}
      <Card label="Search visibility">
        <CardHeader>
          <div className="tl-card__title-row">
            <strong>Are patients finding you?</strong>
            {profile?.isDiscoverable ? (
              <Badge tone="success">Appearing in search</Badge>
            ) : (
              <Badge tone="warning">Not appearing in search</Badge>
            )}
          </div>
        </CardHeader>
        <CardBody>
          <ul className="tl-list">
            <li>
              <div className="tl-card__title-row">
                <strong>Credentials verified</strong>
                {profile?.isVerified ? (
                  <Badge tone="success">Yes</Badge>
                ) : (
                  <Badge tone="warning">
                    {profile?.status === 'SUBMITTED' ? 'Awaiting review' : 'No'}
                  </Badge>
                )}
              </div>
              <span className="tl-list__meta">
                {profile?.isVerified
                  ? 'Your dental council registration has been confirmed.'
                  : profile?.status === 'SUBMITTED'
                    ? 'Your submission is in the review queue.'
                    : 'Add a qualification with your dental council registration number, write a short biography, then submit for verification.'}
              </span>
            </li>
            <li>
              <div className="tl-card__title-row">
                <strong>Practice location confirmed</strong>
                {confirmedPractices > 0 ? (
                  <Badge tone="success">{confirmedPractices} confirmed</Badge>
                ) : (
                  <Badge tone="warning">None</Badge>
                )}
              </div>
              <span className="tl-list__meta">
                A clinic must confirm that you practise there, and that location needs
                coordinates. Without it patients cannot be shown how far away you are.
              </span>
            </li>
          </ul>

          {profile && !profile.isVerified && profile.status !== 'SUBMITTED' ? (
            <>
              {submitError ? (
                <Alert tone="danger" title="Cannot submit yet">
                  {submitError}
                </Alert>
              ) : null}
              <Button onClick={submitForReview} style={{ marginBlockStart: 'var(--tl-space-3)' }}>
                Submit for verification
              </Button>
            </>
          ) : null}
        </CardBody>
      </Card>

      {profile?.verificationHistory.some((v) => v.status === 'REJECTED') ? (
        <Alert tone="warning" title="A previous submission was not approved">
          {profile.verificationHistory.find((v) => v.status === 'REJECTED')?.decisionReason ??
            'No reason was recorded.'}
        </Alert>
      ) : null}

      <Card label="Profile details">
        <CardHeader>
          <strong>Your profile</strong>
        </CardHeader>
        <CardBody>
          <form onSubmit={form.handleSubmit} noValidate className="tl-form">
            {form.formError ? (
              <Alert tone="danger" title="Could not save">
                {form.formError}
              </Alert>
            ) : null}

            <Field
              label="Profile URL"
              required
              hint="Your public address, e.g. /dentists/dr-asha-sharma"
              error={form.fieldErrors.slug}
            >
              {(props) => (
                <Input
                  {...props}
                  value={form.values.slug}
                  onChange={(e) => form.setValue('slug', e.target.value.toLowerCase())}
                />
              )}
            </Field>

            <Field label="Headline" hint="One line, shown under your name in search results.">
              {(props) => (
                <Input
                  {...props}
                  placeholder="Endodontist · 12 years · Raipur"
                  value={form.values.headline}
                  onChange={(e) => form.setValue('headline', e.target.value)}
                />
              )}
            </Field>

            <Field
              label="About you"
              hint={`At least ${MIN_BIO_LENGTH} characters. Required for verification.`}
              error={form.fieldErrors.bio}
            >
              {(props) => (
                <textarea
                  {...props}
                  className="tl-input"
                  rows={5}
                  value={form.values.bio}
                  onChange={(e) => form.setValue('bio', e.target.value)}
                />
              )}
            </Field>

            <Field label="Practising since" error={form.fieldErrors.practisingSince}>
              {(props) => (
                <Input
                  {...props}
                  inputMode="numeric"
                  placeholder="2012"
                  value={form.values.practisingSince}
                  onChange={(e) => form.setValue('practisingSince', e.target.value)}
                />
              )}
            </Field>

            <fieldset className="tl-fieldset">
              <legend className="tl-fieldset__legend">
                Languages you consult in
              </legend>
              <p className="tl-muted" style={{ fontSize: 'var(--tl-text-sm)', marginBlockStart: 0 }}>
                A patient who cannot describe their pain in a shared language cannot be treated
                well. Patients filter on this.
              </p>
              <div className="tl-choice-grid">
                {LANGUAGES.map((language) => (
                  <label
                    key={language.code}
                    className={`tl-choice ${form.values.languages.includes(language.code) ? 'tl-choice--selected' : ''}`}
                  >
                    <input
                      type="checkbox"
                      checked={form.values.languages.includes(language.code)}
                      onChange={() =>
                        form.setValue('languages', toggle(form.values.languages, language.code))
                      }
                    />
                    <span className="tl-choice__label">{language.label}</span>
                  </label>
                ))}
              </div>
            </fieldset>

            <fieldset className="tl-fieldset">
              <legend className="tl-fieldset__legend">Specialties</legend>
              <div className="tl-choice-grid">
                {specialties.map((specialty) => (
                  <label
                    key={specialty.key}
                    className={`tl-choice ${form.values.specialtyKeys.includes(specialty.key) ? 'tl-choice--selected' : ''}`}
                  >
                    <input
                      type="checkbox"
                      checked={form.values.specialtyKeys.includes(specialty.key)}
                      onChange={() =>
                        form.setValue(
                          'specialtyKeys',
                          toggle(form.values.specialtyKeys, specialty.key),
                        )
                      }
                    />
                    <span className="tl-choice__label">{specialty.name}</span>
                    <span className="tl-choice__hint">{specialty.description}</span>
                  </label>
                ))}
              </div>
            </fieldset>

            <Field
              label="Consultation fee (₹)"
              hint="Leave blank if your fee varies. Transparent pricing is a trust signal."
              error={form.fieldErrors.consultationFee}
            >
              {(props) => (
                <Input
                  {...props}
                  inputMode="decimal"
                  placeholder="500"
                  value={form.values.consultationFee}
                  onChange={(e) => form.setValue('consultationFee', e.target.value)}
                />
              )}
            </Field>

            <Button type="submit" loading={form.submitting}>
              Save profile
            </Button>
          </form>
        </CardBody>
      </Card>

      <QualificationsCard qualifications={profile?.qualifications ?? []} />
    </div>
  );
}

/**
 * Qualifications.
 *
 * Each is shown with its own verified state rather than inheriting the
 * profile's. A dentist may hold a verified BDS and an unverified claimed
 * certificate, and showing both as "verified" would be a false credential claim
 * — which on a clinical platform is the most serious kind.
 */
function QualificationsCard({
  qualifications,
}: {
  qualifications: DentistProfileData['qualifications'];
}) {
  const router = useRouter();
  const [warning, setWarning] = useState<string | null>(null);

  const form = useForm({
    initialValues: { degree: '', institution: '', year: '', registrationNumber: '' },

    validate: (values) => {
      const errors: Record<string, string> = {};
      if (values.degree.trim().length < 2) errors.degree = 'Enter the qualification.';
      if (values.institution.trim().length < 2) errors.institution = 'Enter the institution.';
      const year = Number(values.year);
      if (!Number.isInteger(year) || year < 1900 || year > new Date().getFullYear()) {
        errors.year = 'Enter a valid year.';
      }
      return errors;
    },

    submit: (values) =>
      api.post<{ verificationCleared: boolean }>('/api/v1/dentists/me/qualifications', {
        degree: values.degree.trim(),
        institution: values.institution.trim(),
        year: Number(values.year),
        registrationNumber: values.registrationNumber.trim() || undefined,
        registrationBody: values.registrationNumber.trim()
          ? 'Dental Council of India'
          : undefined,
      }),

    onSuccess: (data) => {
      setWarning(
        data.verificationCleared
          ? 'Because you added a credential, your profile has returned to review and you are temporarily not appearing in patient search.'
          : null,
      );
      form.reset();
      router.refresh();
    },
  });

  return (
    <Card label="Qualifications">
      <CardHeader>
        <strong>Qualifications</strong>
      </CardHeader>
      <CardBody>
        {warning ? <Alert tone="warning">{warning}</Alert> : null}

        {qualifications.length === 0 ? (
          <p className="tl-muted">
            Add at least one qualification with your dental council registration number. That
            number is what verification checks.
          </p>
        ) : (
          <ul className="tl-list">
            {qualifications.map((q) => (
              <li key={q.id}>
                <div className="tl-card__title-row">
                  <strong>
                    {q.degree} — {q.institution} ({q.year})
                  </strong>
                  {q.isVerified ? (
                    <Badge tone="success">Verified</Badge>
                  ) : (
                    <Badge tone="neutral">Not verified</Badge>
                  )}
                </div>
                <span className="tl-list__meta">
                  {q.registrationNumber
                    ? `Registration ${q.registrationNumber}`
                    : 'No registration number — this qualification cannot be verified.'}
                </span>
              </li>
            ))}
          </ul>
        )}

        <form
          onSubmit={form.handleSubmit}
          noValidate
          className="tl-form"
          style={{ marginBlockStart: 'var(--tl-space-4)' }}
        >
          {form.formError ? (
            <Alert tone="danger" title="Could not add">
              {form.formError}
            </Alert>
          ) : null}

          <Field label="Qualification" required error={form.fieldErrors.degree}>
            {(props) => (
              <Input
                {...props}
                placeholder="BDS"
                value={form.values.degree}
                onChange={(e) => form.setValue('degree', e.target.value)}
              />
            )}
          </Field>

          <Field label="Institution" required error={form.fieldErrors.institution}>
            {(props) => (
              <Input
                {...props}
                placeholder="Government Dental College"
                value={form.values.institution}
                onChange={(e) => form.setValue('institution', e.target.value)}
              />
            )}
          </Field>

          <Field label="Year awarded" required error={form.fieldErrors.year}>
            {(props) => (
              <Input
                {...props}
                inputMode="numeric"
                placeholder="2012"
                value={form.values.year}
                onChange={(e) => form.setValue('year', e.target.value)}
              />
            )}
          </Field>

          <Field
            label="Dental council registration number"
            hint="Required for verification. Without it this qualification cannot be checked."
          >
            {(props) => (
              <Input
                {...props}
                value={form.values.registrationNumber}
                onChange={(e) => form.setValue('registrationNumber', e.target.value)}
              />
            )}
          </Field>

          <Button type="submit" variant="secondary" loading={form.submitting}>
            Add qualification
          </Button>
        </form>
      </CardBody>
    </Card>
  );
}

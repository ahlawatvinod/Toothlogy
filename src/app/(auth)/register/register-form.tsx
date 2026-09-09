/**
 * Registration form.
 *
 * The full production chain the brief requires:
 * labels → descriptions → required state → client validation → server
 * validation → API → database → session → notification → audit → success state.
 *
 * Choices worth noting:
 *
 * - **Email or phone, not both required.** Phone-first signup is the norm in
 *   the Indian market; demanding an email would exclude those users outright.
 * - **The role is chosen here** and restricted server-side to the four
 *   self-assignable roles, so a crafted request cannot ask for `platform_admin`.
 * - **Password strength is shown, not enforced by composition rules.** Length
 *   dominates real-world strength; `Password1!` satisfies every classic rule and
 *   is weaker than a passphrase.
 */

'use client';

import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Alert, Button, Field, Input } from '@/design-system';
import { api } from '@/lib/api-client';
import { useForm } from '@/components/forms/use-form';

const MIN_PASSWORD_LENGTH = 10;

const ROLES = [
  { value: 'patient', label: 'Patient', hint: 'Find a dentist and manage your care' },
  { value: 'dentist', label: 'Dentist', hint: 'Be discovered by patients near you' },
  { value: 'student', label: 'Student', hint: 'Learn, and find internships' },
  { value: 'supplier', label: 'Supplier', hint: 'Sell products and equipment' },
] as const;

interface RegisterResponse {
  userId: string;
  verificationSent: boolean;
  verificationRequired: boolean;
}

export function RegisterForm({ defaultRole }: { defaultRole?: string }) {
  const router = useRouter();

  const form = useForm({
    initialValues: {
      displayName: '',
      email: '',
      phone: '',
      password: '',
      role: (ROLES.find((r) => r.value === defaultRole)?.value ?? 'patient') as string,
      acceptedTerms: false,
    },

    validate: (values) => {
      const errors: Record<string, string> = {};

      if (values.displayName.trim().length < 1) {
        errors.displayName = 'Enter your name.';
      }
      // Mirrors the server rule: at least one contact method.
      if (!values.email.trim() && !values.phone.trim()) {
        errors.email = 'Enter an email address or a phone number.';
      }
      if (values.email.trim() && !values.email.includes('@')) {
        errors.email = 'Enter a valid email address.';
      }
      if (values.phone.trim() && !/^\+[1-9]\d{6,14}$/.test(values.phone.trim())) {
        errors.phone = 'Use international format, e.g. +919876543210.';
      }
      if (values.password.length < MIN_PASSWORD_LENGTH) {
        errors.password = `Use at least ${MIN_PASSWORD_LENGTH} characters.`;
      }
      if (!values.acceptedTerms) {
        errors.acceptedTerms = 'You must accept the terms to continue.';
      }

      return errors;
    },

    submit: (values) =>
      api.post<RegisterResponse>('/api/v1/auth/register', {
        displayName: values.displayName.trim(),
        email: values.email.trim() || undefined,
        phone: values.phone.trim() || undefined,
        password: values.password,
        role: values.role,
        acceptedTerms: true,
      }),

    onSuccess: () => {
      // Registration signs the user in, so go straight to the account area.
      router.push('/account');
      router.refresh();
    },
  });

  /*
   * `tl-form--wide` widens the surrounding auth panel. This is the only form in
   * the auth group carrying a role chooser on top of five fields, and at the
   * shared 28rem the role cards wrap their hints onto three lines each. The
   * panel opts in from the form rather than the other way round, because the
   * layout renders the panel and cannot know which page is inside it.
   */
  return (
    <form onSubmit={form.handleSubmit} noValidate className="tl-form tl-form--wide">
      {form.formError ? (
        <Alert tone="danger" title="Could not create your account">
          {form.formError}
          {form.requestId ? (
            <>
              {' '}
              <span className="tl-form__reference">Reference: {form.requestId}</span>
            </>
          ) : null}
        </Alert>
      ) : null}

      <Field label="Your name" required>
        {(props) => (
          <Input
            {...props}
            autoComplete="name"
            value={form.values.displayName}
            onChange={(e) => form.setValue('displayName', e.target.value)}
          />
        )}
      </Field>

      <fieldset className="tl-fieldset">
        <legend className="tl-fieldset__legend">I am a…</legend>
        <div className="tl-choice-grid">
          {ROLES.map((role) => (
            <label
              key={role.value}
              className={`tl-choice ${form.values.role === role.value ? 'tl-choice--selected' : ''}`}
            >
              <input
                type="radio"
                name="role"
                value={role.value}
                checked={form.values.role === role.value}
                onChange={() => form.setValue('role', role.value)}
              />
              <span className="tl-choice__label">{role.label}</span>
              <span className="tl-choice__hint">{role.hint}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <Field
        label="Email address"
        hint="Either an email or a phone number is required."
        error={form.fieldErrors.email}
      >
        {(props) => (
          <Input
            {...props}
            type="email"
            inputMode="email"
            autoComplete="email"
            placeholder="you@example.com"
            value={form.values.email}
            onChange={(e) => form.setValue('email', e.target.value)}
          />
        )}
      </Field>

      <Field
        label="Phone number"
        hint="International format, e.g. +919876543210."
        error={form.fieldErrors.phone}
      >
        {(props) => (
          <Input
            {...props}
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            placeholder="+91"
            value={form.values.phone}
            onChange={(e) => form.setValue('phone', e.target.value)}
          />
        )}
      </Field>

      <Field
        label="Password"
        required
        hint={`At least ${MIN_PASSWORD_LENGTH} characters. A memorable phrase is stronger than a short complex password.`}
        error={form.fieldErrors.password}
      >
        {(props) => (
          <Input
            {...props}
            type="password"
            autoComplete="new-password"
            value={form.values.password}
            onChange={(e) => form.setValue('password', e.target.value)}
          />
        )}
      </Field>

      <div className="tl-checkbox">
        <input
          id="acceptedTerms"
          type="checkbox"
          checked={form.values.acceptedTerms}
          aria-invalid={form.fieldErrors.acceptedTerms ? true : undefined}
          aria-describedby={form.fieldErrors.acceptedTerms ? 'acceptedTerms-error' : undefined}
          onChange={(e) => form.setValue('acceptedTerms', e.target.checked)}
        />
        <label htmlFor="acceptedTerms">
          I accept the <Link href="/terms">terms of use</Link> and{' '}
          <Link href="/privacy">privacy policy</Link>.
        </label>
      </div>
      {form.fieldErrors.acceptedTerms ? (
        <p className="tl-field__error" id="acceptedTerms-error" role="alert">
          {form.fieldErrors.acceptedTerms}
        </p>
      ) : null}

      <Button type="submit" fullWidth size="lg" loading={form.submitting}>
        Create account
      </Button>

      <p className="tl-form__aside">
        Already have an account? <Link href="/login">Sign in</Link>
      </p>
    </form>
  );
}

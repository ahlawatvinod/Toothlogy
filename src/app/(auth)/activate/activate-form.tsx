/**
 * The two halves of activation. Without a token in the URL the person asks
 * for a link and a code (and always gets the same answer, so the form cannot
 * reveal who has a prepared profile). With the link's token they enter the
 * code from their mobile and choose a password.
 */

'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Alert, Button, Field, Input } from '@/design-system';
import { api } from '@/lib/api-client';
import { useForm } from '@/components/forms/use-form';

const MIN_PASSWORD_LENGTH = 10;

function StartActivation() {
  const [message, setMessage] = useState<string | null>(null);
  const form = useForm({
    initialValues: { email: '', phone: '' },
    validate: (values) => {
      const errors: Record<string, string> = {};
      if (!/^\S+@\S+\.\S+$/.test(values.email.trim())) errors.email = 'Enter the email address on your profile.';
      if (values.phone.replace(/\D/g, '').length < 10) errors.phone = 'Enter the 10-digit mobile number on your profile.';
      return errors;
    },
    submit: async (values) => {
      const result = await api.post<{ message: string }>('/api/v1/activation/start', { email: values.email.trim(), phone: values.phone.trim() });
      if (result.ok) setMessage(result.data.message);
      return result;
    },
  });

  if (form.succeeded && message) {
    return (
      <div className="tl-stack">
        <Alert tone="success" title="Check your email and phone">
          {message}
        </Alert>
        <p className="tl-muted" style={{ margin: 0 }}>
          Open the link from the email on this device, then enter the code from the SMS. Nothing arrived? Wait a minute and try again, or check the details match your profile.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={form.handleSubmit} noValidate className="tl-form">
      {form.formError ? (
        <Alert tone="danger" title="Could not start activation">
          {form.formError}
        </Alert>
      ) : null}
      <Field label="Email address" required error={form.fieldErrors.email}>
        {(props) => <Input {...props} type="email" autoComplete="email" autoFocus value={form.values.email} onChange={(e) => form.setValue('email', e.target.value)} />}
      </Field>
      <Field label="Mobile number" required hint="The Indian mobile number on your profile." error={form.fieldErrors.phone}>
        {(props) => <Input {...props} type="tel" inputMode="tel" autoComplete="tel" value={form.values.phone} onChange={(e) => form.setValue('phone', e.target.value)} />}
      </Field>
      <Button type="submit" fullWidth size="lg" loading={form.submitting}>
        Send link and code
      </Button>
      <p className="tl-muted" style={{ margin: 0 }}>
        Already active? <Link href="/login">Sign in</Link>. New to Toothlogy? <Link href="/register">Create an account</Link>.
      </p>
    </form>
  );
}

function CompleteActivation({ token }: { token: string }) {
  const router = useRouter();
  const [accepted, setAccepted] = useState(false);
  const form = useForm({
    initialValues: { code: '', password: '', confirmPassword: '' },
    validate: (values) => {
      const errors: Record<string, string> = {};
      if (!/^\d{6}$/.test(values.code.trim())) errors.code = 'Enter the 6-digit code from the SMS.';
      if (values.password.length < MIN_PASSWORD_LENGTH) errors.password = `Use at least ${MIN_PASSWORD_LENGTH} characters.`;
      if (values.password !== values.confirmPassword) errors.confirmPassword = 'The two passwords do not match.';
      if (!accepted) errors.acceptedTerms = 'Accept the terms of use to continue.';
      return errors;
    },
    submit: (values) => api.post('/api/v1/activation/complete', { token, code: values.code.trim(), password: values.password, acceptedTerms: accepted }),
  });

  if (form.succeeded) {
    return (
      <div className="tl-stack">
        <Alert tone="success" title="Your profile is active">
          Sign in with your email address and new password, then complete your profile and ask for verification before patients can find you.
        </Alert>
        <Button fullWidth size="lg" onClick={() => router.push('/login')}>
          Go to sign in
        </Button>
      </div>
    );
  }

  // A bad link is reported against `token`, which has no field on this form:
  // it is the form's problem, shown at the top with the way out.
  const problem = form.fieldErrors.token ?? form.formError;

  return (
    <form onSubmit={form.handleSubmit} noValidate className="tl-form">
      {problem ? (
        <Alert tone="danger" title="Could not activate">
          {problem}
          <p style={{ margin: 'var(--tl-space-2) 0 0' }}>
            <Link href="/activate">Start again</Link>
          </p>
        </Alert>
      ) : null}
      <Field label="Code from the SMS" required error={form.fieldErrors.code}>
        {(props) => <Input {...props} inputMode="numeric" autoComplete="one-time-code" maxLength={6} autoFocus value={form.values.code} onChange={(e) => form.setValue('code', e.target.value)} />}
      </Field>
      <Field label="Choose a password" required hint={`At least ${MIN_PASSWORD_LENGTH} characters.`} error={form.fieldErrors.password}>
        {(props) => <Input {...props} type="password" autoComplete="new-password" value={form.values.password} onChange={(e) => form.setValue('password', e.target.value)} />}
      </Field>
      <Field label="Confirm password" required error={form.fieldErrors.confirmPassword}>
        {(props) => <Input {...props} type="password" autoComplete="new-password" value={form.values.confirmPassword} onChange={(e) => form.setValue('confirmPassword', e.target.value)} />}
      </Field>
      <div>
        <label className="tl-checkbox">
          <input type="checkbox" checked={accepted} onChange={(e) => setAccepted(e.target.checked)} aria-invalid={form.fieldErrors.acceptedTerms ? true : undefined} aria-describedby={form.fieldErrors.acceptedTerms ? 'activate-terms-error' : undefined} />
          <span>
            I accept the <Link href="/terms">terms of use</Link> and the <Link href="/privacy">privacy policy</Link>.
          </span>
        </label>
        {form.fieldErrors.acceptedTerms ? (
          <p id="activate-terms-error" className="tl-field__error" role="alert">
            {form.fieldErrors.acceptedTerms}
          </p>
        ) : null}
      </div>
      <Button type="submit" fullWidth size="lg" loading={form.submitting}>
        Activate
      </Button>
    </form>
  );
}

export function ActivateForm() {
  const token = useSearchParams().get('token') ?? '';
  return token ? <CompleteActivation token={token} /> : <StartActivation />;
}

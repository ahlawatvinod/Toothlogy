/**
 * Password reset request form.
 *
 * The success state is shown for ANY submitted address, registered or not —
 * mirroring the API, which responds identically either way. A form that said
 * "no account with that email" would be an account-enumeration oracle, and for
 * a dental platform, confirming that a named person has an account is
 * health-adjacent information about a real individual.
 *
 * The message is worded so it is true in both cases: "if an account exists".
 */

'use client';

import Link from 'next/link';
import { Alert, Button, Field, Input } from '@/design-system';
import { api } from '@/lib/api-client';
import { useForm } from '@/components/forms/use-form';

export function ForgotPasswordForm() {
  const form = useForm({
    initialValues: { email: '' },

    validate: (values) => {
      const errors: Record<string, string> = {};
      if (!values.email.trim()) errors.email = 'Enter your email address.';
      else if (!values.email.includes('@')) errors.email = 'Enter a valid email address.';
      return errors;
    },

    submit: (values) =>
      api.post('/api/v1/auth/password/reset-request', { email: values.email.trim() }),
  });

  if (form.succeeded) {
    return (
      <div className="tl-stack">
        <Alert tone="success" title="Check your email">
          If an account exists for that address, a password reset link has been sent. The link
          expires in 30 minutes.
        </Alert>
        <p className="tl-form__aside">
          <Link href="/login">Back to sign in</Link>
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={form.handleSubmit} noValidate className="tl-form">
      {form.formError ? (
        <Alert tone="danger" title="Could not send the link">
          {form.formError}
        </Alert>
      ) : null}

      <Field label="Email address" required error={form.fieldErrors.email}>
        {(props) => (
          <Input
            {...props}
            type="email"
            inputMode="email"
            autoComplete="email"
            autoFocus
            value={form.values.email}
            onChange={(e) => form.setValue('email', e.target.value)}
          />
        )}
      </Field>

      <Button type="submit" fullWidth size="lg" loading={form.submitting}>
        Send reset link
      </Button>

      <p className="tl-form__aside">
        <Link href="/login">Back to sign in</Link>
      </p>
    </form>
  );
}

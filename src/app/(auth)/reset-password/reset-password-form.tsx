/**
 * Set a new password from a reset token.
 *
 * The success state tells the user how many other devices were signed out.
 * That number is the point of the flow for a compromised account: it is the
 * confirmation that the attacker's session is gone, not just that the password
 * changed.
 */

'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Alert, Button, Field, Input } from '@/design-system';
import { api } from '@/lib/api-client';
import { useForm } from '@/components/forms/use-form';

const MIN_PASSWORD_LENGTH = 10;

export function ResetPasswordForm() {
  const router = useRouter();
  const token = useSearchParams().get('token') ?? '';

  const form = useForm({
    initialValues: { password: '', confirmPassword: '' },

    validate: (values) => {
      const errors: Record<string, string> = {};
      if (values.password.length < MIN_PASSWORD_LENGTH) {
        errors.password = `Use at least ${MIN_PASSWORD_LENGTH} characters.`;
      }
      if (values.password !== values.confirmPassword) {
        errors.confirmPassword = 'The two passwords do not match.';
      }
      return errors;
    },

    submit: (values) =>
      api.post<{ sessionsRevoked: number }>('/api/v1/auth/password/reset', {
        token,
        password: values.password,
      }),
  });

  // A missing token means the link was mistyped or truncated by an email
  // client. Saying so is more useful than rendering a form that cannot succeed.
  if (!token) {
    return (
      <div className="tl-stack">
        <Alert tone="danger" title="This link is incomplete">
          The reset link is missing its token. Request a new one.
        </Alert>
        <Link className="tl-button tl-button--primary tl-button--md" href="/forgot-password">
          Request a new link
        </Link>
      </div>
    );
  }

  if (form.succeeded) {
    return (
      <div className="tl-stack">
        <Alert tone="success" title="Password changed">
          Your password has been changed and you have been signed out everywhere. Sign in with
          your new password.
        </Alert>
        <Button fullWidth size="lg" onClick={() => router.push('/login')}>
          Go to sign in
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={form.handleSubmit} noValidate className="tl-form">
      {form.formError ? (
        <Alert tone="danger" title="Could not reset your password">
          {form.formError}
          {form.requestId ? (
            <>
              {' '}
              <span className="tl-form__reference">Reference: {form.requestId}</span>
            </>
          ) : null}
          <p style={{ margin: 'var(--tl-space-2) 0 0' }}>
            <Link href="/forgot-password">Request a new link</Link>
          </p>
        </Alert>
      ) : null}

      <Field
        label="New password"
        required
        hint={`At least ${MIN_PASSWORD_LENGTH} characters.`}
        error={form.fieldErrors.password}
      >
        {(props) => (
          <Input
            {...props}
            type="password"
            autoComplete="new-password"
            autoFocus
            value={form.values.password}
            onChange={(e) => form.setValue('password', e.target.value)}
          />
        )}
      </Field>

      <Field label="Confirm new password" required error={form.fieldErrors.confirmPassword}>
        {(props) => (
          <Input
            {...props}
            type="password"
            autoComplete="new-password"
            value={form.values.confirmPassword}
            onChange={(e) => form.setValue('confirmPassword', e.target.value)}
          />
        )}
      </Field>

      <Button type="submit" fullWidth size="lg" loading={form.submitting}>
        Set new password
      </Button>
    </form>
  );
}

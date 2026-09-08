/**
 * Sign-in form.
 *
 * One `identifier` field accepting either an email or a phone number, rather
 * than a toggle. The server already resolves both, and asking the user to first
 * declare which kind of credential they are about to type is a step that exists
 * only for the implementation's convenience.
 *
 * The error message is deliberately identical for a wrong password and an
 * unknown account, mirroring the server. A helpful "no account with that email"
 * would turn this form into an account-enumeration oracle.
 */

'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Alert, Button, Field, Input } from '@/design-system';
import { api } from '@/lib/api-client';
import { useForm } from '@/components/forms/use-form';

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();

  /*
   * Only same-origin relative paths are honoured as a post-login destination.
   * An unvalidated `next` parameter is an open redirect: an attacker sends
   * `/login?next=https://evil.example` and the victim lands on a convincing
   * fake immediately after authenticating.
   */
  const requestedNext = searchParams.get('next');
  const next =
    requestedNext && requestedNext.startsWith('/') && !requestedNext.startsWith('//')
      ? requestedNext
      : '/account';

  const form = useForm({
    initialValues: { identifier: '', password: '' },

    validate: (values) => {
      const errors: Record<string, string> = {};
      if (!values.identifier.trim()) errors.identifier = 'Enter your email or phone number.';
      if (!values.password) errors.password = 'Enter your password.';
      return errors;
    },

    submit: (values) =>
      api.post('/api/v1/auth/login', {
        identifier: values.identifier.trim(),
        password: values.password,
      }),

    onSuccess: () => {
      router.push(next);
      router.refresh();
    },
  });

  return (
    <form onSubmit={form.handleSubmit} noValidate className="tl-form">
      {form.formError ? (
        <Alert tone="danger" title="Could not sign you in">
          {form.formError}
          {form.requestId ? (
            <>
              {' '}
              <span className="tl-form__reference">Reference: {form.requestId}</span>
            </>
          ) : null}
        </Alert>
      ) : null}

      <Field label="Email or phone number" required error={form.fieldErrors.identifier}>
        {(props) => (
          <Input
            {...props}
            autoComplete="username"
            autoFocus
            value={form.values.identifier}
            onChange={(e) => form.setValue('identifier', e.target.value)}
          />
        )}
      </Field>

      <Field label="Password" required error={form.fieldErrors.password}>
        {(props) => (
          <Input
            {...props}
            type="password"
            autoComplete="current-password"
            value={form.values.password}
            onChange={(e) => form.setValue('password', e.target.value)}
          />
        )}
      </Field>

      <Button type="submit" fullWidth size="lg" loading={form.submitting}>
        Sign in
      </Button>

      <p className="tl-form__aside">
        <Link href="/forgot-password">Forgot your password?</Link>
      </p>
      <p className="tl-form__aside">
        New to Toothlogy? <Link href="/register">Create an account</Link>
      </p>
    </form>
  );
}

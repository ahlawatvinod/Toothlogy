/**
 * Security settings: active sessions and password change.
 *
 * These two live together because they are the same task: a user who suspects
 * their account is compromised needs to see the unfamiliar device, end it, and
 * change the password — in that order, on one screen. Splitting them across two
 * pages puts a navigation step in the middle of an urgent flow.
 *
 * Sessions arrive as props from the server component. After a mutation the
 * client calls `router.refresh()` rather than re-fetching itself, so there is
 * one place that knows how to read sessions and no client-side loading state.
 */

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
  Table,
} from '@/design-system';
import { api } from '@/lib/api-client';
import { useForm } from '@/components/forms/use-form';

export interface SessionRow {
  id: string;
  ipAddress: string | null;
  userAgent: string | null;
  lastActiveAt: string;
  isCurrent: boolean;
}

export function SecurityClient({ sessions }: { sessions: readonly SessionRow[] }) {
  const router = useRouter();
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<{ message: string; requestId: string } | null>(null);
  // `useTransition` keeps the table interactive while the server component
  // re-renders, instead of blanking it behind a spinner.
  const [pending, startTransition] = useTransition();

  const refresh = () => startTransition(() => router.refresh());

  const revoke = async (sessionId: string) => {
    setError(null);
    const result = await api.post('/api/v1/auth/sessions', { sessionId });
    if (result.ok) {
      setNotice('That device has been signed out.');
      refresh();
    } else {
      setError({ message: result.message, requestId: result.requestId });
    }
  };

  const revokeOthers = async () => {
    setError(null);
    const result = await api.post<{ revoked: number }>('/api/v1/auth/sessions', {
      allOthers: true,
    });
    if (result.ok) {
      setNotice(
        result.data.revoked === 0
          ? 'There were no other devices signed in.'
          : `Signed out of ${result.data.revoked} other device(s).`,
      );
      refresh();
    } else {
      setError({ message: result.message, requestId: result.requestId });
    }
  };

  const passwordForm = useForm({
    initialValues: { currentPassword: '', newPassword: '', confirmPassword: '' },

    validate: (values) => {
      const errors: Record<string, string> = {};
      if (!values.currentPassword) errors.currentPassword = 'Enter your current password.';
      if (values.newPassword.length < 10) errors.newPassword = 'Use at least 10 characters.';
      // Checked client-side only: the confirmation field is not part of the
      // API, so the server has no reason to know the user mistyped it.
      if (values.newPassword !== values.confirmPassword) {
        errors.confirmPassword = 'The two passwords do not match.';
      }
      return errors;
    },

    submit: (values) =>
      api.post<{ otherSessionsRevoked: number }>('/api/v1/auth/password/change', {
        currentPassword: values.currentPassword,
        newPassword: values.newPassword,
      }),

    onSuccess: () => {
      setNotice('Your password has been changed. Other devices were signed out.');
      passwordForm.reset();
      refresh();
    },
  });

  return (
    <div className="tl-stack">
      {notice ? <Alert tone="success">{notice}</Alert> : null}
      {error ? (
        <Alert tone="danger" title="Something went wrong">
          {error.message}
          {error.requestId ? (
            <>
              {' '}
              <span className="tl-form__reference">Reference: {error.requestId}</span>
            </>
          ) : null}
        </Alert>
      ) : null}

      <Card label="Active sessions">
        <CardHeader>
          <div className="tl-card__title-row">
            <strong>Devices signed in</strong>
            <Button variant="secondary" size="sm" loading={pending} onClick={revokeOthers}>
              Sign out other devices
            </Button>
          </div>
        </CardHeader>
        <CardBody>
          <p className="tl-muted">
            If you do not recognise a device here, sign it out and change your password.
          </p>

          {sessions.length === 0 ? (
            <EmptyState
              title="No active sessions"
              description="This is unexpected while you are signed in. Try reloading the page."
            />
          ) : (
            <Table caption="Devices currently signed in to your account">
              <thead>
                <tr>
                  <th scope="col">Device</th>
                  <th scope="col">IP address</th>
                  <th scope="col">Last active</th>
                  <th scope="col">
                    <span className="tl-visually-hidden">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {sessions.map((session) => (
                  <tr key={session.id}>
                    <td>
                      {session.userAgent ?? 'Unknown device'}
                      {session.isCurrent ? <strong> (this device)</strong> : null}
                    </td>
                    <td>{session.ipAddress ?? '—'}</td>
                    <td>{new Date(session.lastActiveAt).toLocaleString()}</td>
                    <td>
                      {session.isCurrent ? (
                        <span className="tl-muted">Current</span>
                      ) : (
                        <Button
                          variant="ghost"
                          size="sm"
                          loading={pending}
                          onClick={() => revoke(session.id)}
                        >
                          Sign out
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </CardBody>
      </Card>

      <Card label="Change password">
        <CardHeader>
          <strong>Change your password</strong>
        </CardHeader>
        <CardBody>
          <form onSubmit={passwordForm.handleSubmit} noValidate className="tl-form">
            {passwordForm.formError ? (
              <Alert tone="danger" title="Could not change your password">
                {passwordForm.formError}
              </Alert>
            ) : null}

            <Field
              label="Current password"
              required
              hint="Required even though you are signed in, so a device left unattended cannot take over your account."
              error={passwordForm.fieldErrors.currentPassword}
            >
              {(props) => (
                <Input
                  {...props}
                  type="password"
                  autoComplete="current-password"
                  value={passwordForm.values.currentPassword}
                  onChange={(e) => passwordForm.setValue('currentPassword', e.target.value)}
                />
              )}
            </Field>

            <Field
              label="New password"
              required
              hint="At least 10 characters. A memorable phrase is stronger than a short complex password."
              error={passwordForm.fieldErrors.newPassword}
            >
              {(props) => (
                <Input
                  {...props}
                  type="password"
                  autoComplete="new-password"
                  value={passwordForm.values.newPassword}
                  onChange={(e) => passwordForm.setValue('newPassword', e.target.value)}
                />
              )}
            </Field>

            <Field
              label="Confirm new password"
              required
              error={passwordForm.fieldErrors.confirmPassword}
            >
              {(props) => (
                <Input
                  {...props}
                  type="password"
                  autoComplete="new-password"
                  value={passwordForm.values.confirmPassword}
                  onChange={(e) => passwordForm.setValue('confirmPassword', e.target.value)}
                />
              )}
            </Field>

            <Button type="submit" loading={passwordForm.submitting}>
              Change password
            </Button>
          </form>
        </CardBody>
      </Card>
    </div>
  );
}

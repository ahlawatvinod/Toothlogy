/**
 * Invite a member.
 *
 * On success this shows the invitation LINK, not just "invitation sent".
 *
 * That is a deliberate consequence of Constitution P10: no email provider is
 * configured, so nothing was actually emailed. Saying "invitation sent" would
 * be a fabricated success, and the administrator would wait for a message that
 * never arrives. Handing them the link instead means the feature genuinely
 * works today — they can send it themselves — and the UI tells the truth about
 * what happened.
 */

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Alert, Button, Card, CardBody, CardHeader, Field, Input } from '@/design-system';
import { api } from '@/lib/api-client';
import { useForm } from '@/components/forms/use-form';

const ROLES = [
  { value: 'clinic_staff', label: 'Staff — can view the organization' },
  { value: 'dentist', label: 'Dentist — practising clinician' },
  { value: 'clinic_admin', label: 'Administrator — full management' },
] as const;

interface InviteResponse {
  invitationId: string;
  expiresAt: string;
  delivered: boolean;
  inviteToken: string;
}

export function InviteMemberForm({ organizationId }: { organizationId: string }) {
  const router = useRouter();
  const [issued, setIssued] = useState<InviteResponse | null>(null);

  const form = useForm({
    initialValues: { email: '', roleKey: 'clinic_staff' as string },

    validate: (values) => {
      const errors: Record<string, string> = {};
      if (!values.email.trim()) errors.email = 'Enter an email address.';
      else if (!values.email.includes('@')) errors.email = 'Enter a valid email address.';
      return errors;
    },

    submit: (values) =>
      api.post<InviteResponse>(`/api/v1/organizations/${organizationId}/invitations`, {
        email: values.email.trim().toLowerCase(),
        roleKey: values.roleKey,
      }),

    onSuccess: (data) => {
      setIssued(data);
      router.refresh();
    },
  });

  const inviteUrl =
    issued && typeof window !== 'undefined'
      ? `${window.location.origin}/invitations/accept?token=${issued.inviteToken}`
      : '';

  return (
    <Card label="Invite a member">
      <CardHeader>
        <strong>Invite someone</strong>
      </CardHeader>
      <CardBody>
        {issued ? (
          <div className="tl-stack">
            <Alert
              tone={issued.delivered ? 'success' : 'warning'}
              title={issued.delivered ? 'Invitation sent' : 'Invitation created, but not emailed'}
            >
              {issued.delivered
                ? 'The invitation has been delivered.'
                : 'No email provider is configured, so nothing was sent. Share this link with the person you are inviting — it works exactly the same way.'}
            </Alert>

            {!issued.delivered ? (
              <Field label="Invitation link" hint="Expires in 7 days. It can be used once.">
                {(props) => <Input {...props} readOnly value={inviteUrl} />}
              </Field>
            ) : null}

            <Button
              variant="secondary"
              onClick={() => {
                setIssued(null);
                form.reset();
              }}
            >
              Invite someone else
            </Button>
          </div>
        ) : (
          <form onSubmit={form.handleSubmit} noValidate className="tl-form">
            {form.formError ? (
              <Alert tone="danger" title="Could not create the invitation">
                {form.formError}
              </Alert>
            ) : null}

            <Field
              label="Email address"
              required
              hint="The invitation can only be accepted by an account with this email address."
              error={form.fieldErrors.email}
            >
              {(props) => (
                <Input
                  {...props}
                  type="email"
                  inputMode="email"
                  value={form.values.email}
                  onChange={(e) => form.setValue('email', e.target.value)}
                />
              )}
            </Field>

            <Field label="Role" required error={form.fieldErrors.roleKey}>
              {(props) => (
                <select
                  {...props}
                  className="tl-input"
                  value={form.values.roleKey}
                  onChange={(e) => form.setValue('roleKey', e.target.value)}
                >
                  {ROLES.map((r) => (
                    <option key={r.value} value={r.value}>
                      {r.label}
                    </option>
                  ))}
                </select>
              )}
            </Field>

            <Button type="submit" loading={form.submitting}>
              Create invitation
            </Button>
          </form>
        )}
      </CardBody>
    </Card>
  );
}

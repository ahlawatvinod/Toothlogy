/**
 * Members, with role changes and removal for administrators.
 *
 * The owner's row has no controls: the owner stays an administrator and
 * cannot be removed — ownership moves only by the owner's own transfer. The
 * server enforces that; the missing controls just avoid offering an action
 * that will be refused.
 */

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Alert, Badge, Button, Table } from '@/design-system';
import { api } from '@/lib/api-client';

export interface MemberRow {
  readonly userId: string;
  readonly name: string;
  readonly email: string | null;
  readonly roleKey: string;
  readonly joinedLabel: string;
  readonly isOwner: boolean;
  readonly isYou: boolean;
}

const ROLES = [
  { value: 'clinic_admin', label: 'Administrator' },
  { value: 'clinician', label: 'Clinician' },
  { value: 'dentist', label: 'Dentist' },
  { value: 'clinic_staff', label: 'Staff' },
] as const;

function roleLabel(key: string): string {
  return ROLES.find((r) => r.value === key)?.label ?? key.replace(/_/g, ' ');
}

export function MembersPanel({
  organizationId,
  organizationName,
  members,
  canManage,
}: {
  organizationId: string;
  organizationName: string;
  members: readonly MemberRow[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function changeRole(userId: string, roleKey: string) {
    setBusy(userId);
    setError(null);
    const result = await api.patch(`/api/v1/organizations/${organizationId}/members`, { userId, roleKey });
    setBusy(null);
    if (!result.ok) return setError(result.message);
    router.refresh();
  }

  async function remove(userId: string) {
    setBusy(userId);
    setError(null);
    const result = await api.delete(
      `/api/v1/organizations/${organizationId}/members?userId=${encodeURIComponent(userId)}`,
    );
    setBusy(null);
    setConfirming(null);
    if (!result.ok) return setError(result.message);
    router.refresh();
  }

  return (
    <div className="tl-stack">
      {error ? (
        <Alert tone="danger" title="That change was not made">
          {error}
        </Alert>
      ) : null}
      <Table caption={`People in ${organizationName}`}>
        <thead>
          <tr>
            <th scope="col">Name</th>
            <th scope="col">Email</th>
            <th scope="col">Role</th>
            <th scope="col">Joined</th>
            {canManage ? <th scope="col">Actions</th> : null}
          </tr>
        </thead>
        <tbody>
          {members.map((m) => {
            const editable = canManage && !m.isOwner;
            return (
              <tr key={m.userId}>
                <td>
                  {m.name}
                  {m.isYou ? <span className="tl-muted"> (you)</span> : null}
                  {m.isOwner ? (
                    <>
                      {' '}
                      <Badge tone="brand">Owner</Badge>
                    </>
                  ) : null}
                </td>
                <td>{m.email ?? '—'}</td>
                <td>
                  {editable ? (
                    <select
                      className="tl-input"
                      aria-label={`Role for ${m.name}`}
                      value={m.roleKey}
                      disabled={busy === m.userId}
                      onChange={(e) => changeRole(m.userId, e.target.value)}
                    >
                      {ROLES.map((r) => (
                        <option key={r.value} value={r.value}>
                          {r.label}
                        </option>
                      ))}
                    </select>
                  ) : (
                    roleLabel(m.roleKey)
                  )}
                </td>
                <td>{m.joinedLabel}</td>
                {canManage ? (
                  <td>
                    {editable && !m.isYou ? (
                      confirming === m.userId ? (
                        <span className="tl-inline">
                          <Button size="sm" variant="danger" loading={busy === m.userId} onClick={() => remove(m.userId)}>
                            Confirm removal
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => setConfirming(null)}>
                            Cancel
                          </Button>
                        </span>
                      ) : (
                        <Button size="sm" variant="secondary" onClick={() => setConfirming(m.userId)}>
                          Remove
                        </Button>
                      )
                    ) : (
                      <span className="tl-muted">—</span>
                    )}
                  </td>
                ) : null}
              </tr>
            );
          })}
        </tbody>
      </Table>
    </div>
  );
}

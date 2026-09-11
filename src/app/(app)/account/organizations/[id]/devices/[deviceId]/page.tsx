/**
 * TL-PAGE-ORG-DEVICE-001 — /account/organizations/:id/devices/:deviceId
 *
 * One device: open alerts to resolve, the latest reading of each kind against
 * its limits, recent readings, the limits editor, re-key and retire. 404
 * without tl.iot.device.read on the device's organization.
 */

import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { currentPrincipal } from '@/platform/auth/server';
import { isAuthenticated } from '@/platform/rbac';
import { deviceDetail } from '@/platform/devices/service';
import { DEVICE_KIND_LABEL, SUGGESTED_METRICS } from '@/platform/devices/labels';
import { absoluteUrl } from '@/platform/notifications';
import { isAppError } from '@/platform/kernel/errors';
import { Badge, Card, CardBody, CardHeader, EmptyState } from '@/design-system';
import { DeviceActions, LimitsEditor, ResolveAlert } from '@/components/devices/device-forms';

export const metadata: Metadata = { title: 'Device', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

const range = (min: number | null, max: number | null) => (min != null && max != null ? `${min} to ${max}` : min != null ? `at least ${min}` : max != null ? `at most ${max}` : 'no limit');

export default async function DevicePage({ params }: { params: Promise<{ id: string; deviceId: string }> }) {
  const { id, deviceId } = await params;
  const principal = await currentPrincipal();
  if (!isAuthenticated(principal)) notFound();
  const data = await deviceDetail(principal, deviceId).catch((error) => {
    if (isAppError(error) && error.code === 'NOT_FOUND') return null;
    throw error;
  });
  if (!data || data.device.organizationId !== id) notFound();
  const { device: d } = data;
  const when = (x: Date) => new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'medium', timeZone: 'Asia/Kolkata' }).format(x);
  const limitOf = new Map(d.limits.map((l) => [l.metric, l]));
  const open = d.alerts.filter((a) => !a.resolvedAt);
  const closed = d.alerts.filter((a) => a.resolvedAt);

  return (
    <div className="tl-page">
      <nav aria-label="Breadcrumb" className="tl-breadcrumb">
        <Link href={`/account/organizations/${id}/devices`}>Equipment</Link>
        <span aria-hidden="true"> / </span>
        <span aria-current="page">{d.name}</span>
      </nav>
      <header className="tl-page__header">
        <div className="tl-card__title-row">
          <h1>{d.name}</h1>
          <Badge tone="neutral">{DEVICE_KIND_LABEL[d.kind]}</Badge>
          {d.status === 'RETIRED' ? <Badge tone="neutral">retired</Badge> : d.connectedAt ? <Badge tone="success">connected</Badge> : <Badge tone="warning">not reported yet</Badge>}
        </div>
        <p className="tl-page__lead">
          {d.serialNumber ? `Serial ${d.serialNumber} · ` : ''}token ending …{d.tokenHint}
          {d.lastSeenAt ? ` · last reported ${when(d.lastSeenAt)}` : ''}
        </p>
      </header>

      <Card label="Alerts">
        <CardHeader>
          <strong>Alerts</strong>
        </CardHeader>
        <CardBody>
          {open.length === 0 ? (
            <p className="tl-muted" style={{ margin: 0 }}>
              No open alerts.
            </p>
          ) : (
            <ul className="tl-list" aria-label="Open alerts">
              {open.map((a) => (
                <li key={a.id} className="tl-stack">
                  <span>
                    <Badge tone="danger">open</Badge> <strong>{a.message}</strong>
                  </span>
                  <span className="tl-list__meta">since {when(a.openedAt)}</span>
                  {data.canManage ? <ResolveAlert alertId={a.id} /> : null}
                </li>
              ))}
            </ul>
          )}
          {closed.length > 0 ? (
            <details style={{ marginTop: 'var(--tl-space-3)' }}>
              <summary>Resolved ({closed.length})</summary>
              <ul className="tl-list" aria-label="Resolved alerts">
                {closed.map((a) => (
                  <li key={a.id}>
                    {a.message}
                    <span className="tl-list__meta">
                      {' '}
                      · {when(a.openedAt)} → resolved {when(a.resolvedAt!)}
                      {a.resolutionNote ? ` — ${a.resolutionNote}` : ''}
                    </span>
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
        </CardBody>
      </Card>

      <Card label="Latest readings">
        <CardHeader>
          <strong>Latest readings</strong>
        </CardHeader>
        <CardBody>
          {data.latest.length === 0 ? (
            <EmptyState title="No readings yet" description="Readings appear here once the device reports with its token." />
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table className="tl-table" aria-label="Latest readings">
                <thead>
                  <tr>
                    <th scope="col">Reading</th>
                    <th scope="col">Value</th>
                    <th scope="col">Limits</th>
                    <th scope="col">At</th>
                  </tr>
                </thead>
                <tbody>
                  {data.latest.map((r) => {
                    const l = limitOf.get(r.metric);
                    return (
                      <tr key={r.metric}>
                        <td>{r.metric}</td>
                        <td>
                          <strong>{r.value}</strong>
                        </td>
                        <td>{l ? range(l.min, l.max) : r.metric === 'fault' ? 'any fault alerts' : 'no limit'}</td>
                        <td>{when(r.recordedAt)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          {data.recent.length > 0 ? (
            <details style={{ marginTop: 'var(--tl-space-3)' }}>
              <summary>Recent readings ({data.recent.length})</summary>
              <ul className="tl-list" aria-label="Recent readings">
                {data.recent.map((r) => (
                  <li key={r.id}>
                    {r.metric} = {r.value} <span className="tl-list__meta">· {when(r.recordedAt)}</span>
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
        </CardBody>
      </Card>

      {data.canManage && d.status === 'ACTIVE' ? (
        <Card label="Limits">
          <CardHeader>
            <strong>Limits</strong>
          </CardHeader>
          <CardBody>
            <LimitsEditor deviceId={d.id} limits={d.limits} suggestions={SUGGESTED_METRICS[d.kind] ?? ['fault']} />
          </CardBody>
        </Card>
      ) : null}

      {data.canManage ? <DeviceActions deviceId={d.id} telemetryUrl={absoluteUrl('/api/v1/devices/telemetry')} active={d.status === 'ACTIVE'} /> : null}
    </div>
  );
}

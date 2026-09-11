/**
 * TL-PAGE-ORG-DEVICES-001 — /account/organizations/:id/devices
 *
 * The practice's connected equipment — status, when each last reported, open
 * alerts — and registering a device, whose token is shown once. 404 without
 * tl.iot.device.read.
 */

import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { currentPrincipal } from '@/platform/auth/server';
import { isAuthenticated } from '@/platform/rbac';
import { listDevices } from '@/platform/devices/service';
import { DEVICE_KIND_LABEL } from '@/platform/devices/labels';
import { absoluteUrl } from '@/platform/notifications';
import { isAppError } from '@/platform/kernel/errors';
import { Badge, Card, CardBody, CardHeader, EmptyState } from '@/design-system';
import { RegisterDeviceForm } from '@/components/devices/device-forms';

export const metadata: Metadata = { title: 'Equipment', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

export default async function DevicesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const principal = await currentPrincipal();
  if (!isAuthenticated(principal)) notFound();
  const data = await listDevices(principal, id).catch((error) => {
    if (isAppError(error) && error.code === 'NOT_FOUND') return null;
    throw error;
  });
  if (!data) notFound();
  const when = (d: Date) => new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kolkata' }).format(d);

  return (
    <div className="tl-page">
      <nav aria-label="Breadcrumb" className="tl-breadcrumb">
        <Link href={`/account/organizations/${id}`}>{data.organization.name}</Link>
        <span aria-hidden="true"> / </span>
        <span aria-current="page">Equipment</span>
      </nav>
      <header className="tl-page__header">
        <h1>Equipment</h1>
        <p className="tl-page__lead">Connected devices report readings to Toothlogy with their own token. A reading outside the limits you set, or a fault, opens an alert and tells your administrators.</p>
      </header>
      {data.devices.length === 0 ? (
        <EmptyState title="No equipment registered" description={data.canManage ? 'Register a device below.' : 'Your administrators register devices.'} />
      ) : (
        <ul className="tl-list" aria-label="Devices">
          {data.devices.map((d) => (
            <li key={d.id} aria-label={d.name}>
              <div className="tl-card__title-row">
                <Link href={`/account/organizations/${id}/devices/${d.id}`}>
                  <strong>{d.name}</strong>
                </Link>
                <Badge tone="neutral">{DEVICE_KIND_LABEL[d.kind]}</Badge>
                {d.status === 'RETIRED' ? <Badge tone="neutral">retired</Badge> : null}
                {d.openAlerts > 0 ? <Badge tone="danger">{d.openAlerts === 1 ? '1 alert' : `${d.openAlerts} alerts`}</Badge> : null}
              </div>
              <span className="tl-list__meta">{d.lastSeenAt ? `last reported ${when(d.lastSeenAt)}` : 'has not reported yet'}</span>
            </li>
          ))}
        </ul>
      )}
      {data.canManage ? (
        <Card label="Register a device">
          <CardHeader>
            <strong>Register a device</strong>
          </CardHeader>
          <CardBody>
            <RegisterDeviceForm organizationId={id} telemetryUrl={absoluteUrl('/api/v1/devices/telemetry')} />
          </CardBody>
        </Card>
      ) : null}
    </div>
  );
}

/**
 * TL-PAGE-DESIGNSYSTEM-001 — Design system reference
 *
 * A living reference: it renders the real components, so it cannot show a
 * version that no longer matches the code. A screenshot-based style guide
 * drifts silently; this one breaks when a component breaks.
 *
 * Internal tooling — never indexed, and gated by the `design_system_reference`
 * flag, which is off in production.
 */

import { notFound } from 'next/navigation';
import { isFlagEnabled } from '@/platform/flags';
import {
  Alert,
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  ErrorState,
  LoadingState,
  Skeleton,
  Spinner,
  Table,
  ThemeToggle,
} from '@/design-system';
import { DesignSystemInteractive } from './interactive';

export const metadata = {
  title: 'Design system',
  robots: { index: false, follow: false },
};

const SWATCHES: ReadonlyArray<{ token: string; label: string }> = [
  { token: '--tl-color-brand', label: 'brand' },
  { token: '--tl-color-surface', label: 'surface' },
  { token: '--tl-color-surface-sunken', label: 'surface-sunken' },
  { token: '--tl-color-success', label: 'success' },
  { token: '--tl-color-warning', label: 'warning' },
  { token: '--tl-color-danger', label: 'danger' },
  { token: '--tl-color-info', label: 'info' },
];

export default function DesignSystemPage() {
  // The flag gate returns 404 rather than 403, so the route is
  // indistinguishable from one that does not exist.
  if (!isFlagEnabled('design_system_reference')) notFound();

  return (
    <main className="tl-container" style={{ paddingBlock: 'var(--tl-space-7)' }}>
      <header style={{ marginBlockEnd: 'var(--tl-space-6)' }}>
        <h1 style={{ marginBlockEnd: 'var(--tl-space-2)' }}>Toothlogy design system</h1>
        <p style={{ color: 'var(--tl-color-text-muted)', maxWidth: '68ch' }}>
          Every primitive, rendered live. Switch the theme to check both palettes — every
          component below reads its colours from tokens, so nothing here is hard-coded.
        </p>
        <ThemeToggle />
      </header>

      <div className="tl-spec">
        <Card label="Colour tokens">
          <CardHeader>
            <strong>Colour</strong>
          </CardHeader>
          <CardBody>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(7rem, 1fr))',
                gap: 'var(--tl-space-3)',
              }}
            >
              {SWATCHES.map((swatch) => (
                <div className="tl-swatch" key={swatch.token}>
                  <span
                    className="tl-swatch__chip"
                    style={{ background: `var(${swatch.token})` }}
                  />
                  <code>{swatch.label}</code>
                </div>
              ))}
            </div>
          </CardBody>
        </Card>

        <Card label="Buttons">
          <CardHeader>
            <strong>Button</strong>
          </CardHeader>
          <CardBody>
            <div className="tl-spec__row">
              <Button variant="primary">Primary</Button>
              <Button variant="secondary">Secondary</Button>
              <Button variant="ghost">Ghost</Button>
              <Button variant="danger">Danger</Button>
              <Button disabled>Disabled</Button>
              <Button loading>Saving</Button>
            </div>
            <div className="tl-spec__row" style={{ marginBlockStart: 'var(--tl-space-3)' }}>
              <Button size="sm">Small</Button>
              <Button size="md">Medium</Button>
              <Button size="lg">Large</Button>
            </div>
          </CardBody>
        </Card>

        <Card label="Badges and alerts">
          <CardHeader>
            <strong>Status</strong>
          </CardHeader>
          <CardBody>
            <div className="tl-spec__row">
              <Badge>Neutral</Badge>
              <Badge tone="brand">Brand</Badge>
              <Badge tone="success">Verified</Badge>
              <Badge tone="warning">Pending</Badge>
              <Badge tone="danger">Rejected</Badge>
              <Badge tone="info">Promoted</Badge>
            </div>
            <div style={{ display: 'grid', gap: 'var(--tl-space-3)', marginBlockStart: 'var(--tl-space-4)' }}>
              <Alert tone="info" title="Information">
                Every alert carries a visually hidden severity word, so its meaning survives without colour.
              </Alert>
              <Alert tone="success">Your changes were saved.</Alert>
              <Alert tone="warning" title="Verification expiring">
                This registration expires in 14 days.
              </Alert>
              <Alert tone="danger" title="Payment failed">
                No charge was made. Please try a different method.
              </Alert>
            </div>
          </CardBody>
        </Card>

        <Card label="Forms and dialogs">
          <CardHeader>
            <strong>Interactive</strong>
          </CardHeader>
          <CardBody>
            <DesignSystemInteractive />
          </CardBody>
        </Card>

        <Card label="States">
          <CardHeader>
            <strong>Empty, loading and error states</strong>
          </CardHeader>
          <CardBody>
            <div style={{ display: 'grid', gap: 'var(--tl-space-4)' }}>
              <EmptyState
                title="No dentists match these filters"
                description="Try widening the distance, or removing a specialty filter."
                action={<Button variant="secondary">Clear filters</Button>}
              />
              <LoadingState />
              <ErrorState requestId="req_01JF3QK8ZR7X2V9NBQ4C6T5MHD" />
            </div>
          </CardBody>
        </Card>

        <Card label="Loading placeholders">
          <CardHeader>
            <strong>Skeleton and spinner</strong>
          </CardHeader>
          <CardBody>
            <div style={{ display: 'grid', gap: 'var(--tl-space-2)', maxWidth: '24rem' }}>
              <Skeleton height="1.5rem" width="60%" />
              <Skeleton />
              <Skeleton width="80%" />
            </div>
            <div className="tl-spec__row" style={{ marginBlockStart: 'var(--tl-space-4)' }}>
              <Spinner size="sm" />
              <Spinner size="md" />
            </div>
          </CardBody>
        </Card>

        <Card label="Table">
          <CardHeader>
            <strong>Table</strong>
          </CardHeader>
          <CardBody>
            <Table caption="Example clinic roster">
              <thead>
                <tr>
                  <th scope="col">Name</th>
                  <th scope="col">Role</th>
                  <th scope="col">Status</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Example Clinic, Raipur</td>
                  <td>Clinic</td>
                  <td>
                    <Badge tone="success">Verified</Badge>
                  </td>
                </tr>
                <tr>
                  <td>Example Dental College</td>
                  <td>College</td>
                  <td>
                    <Badge tone="warning">Pending</Badge>
                  </td>
                </tr>
              </tbody>
            </Table>
          </CardBody>
        </Card>
      </div>
    </main>
  );
}

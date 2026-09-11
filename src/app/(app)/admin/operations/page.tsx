/**
 * TL-PAGE-ADMIN-OPERATIONS-001 — /admin/operations
 *
 * The district command centre for Toothlogy's operations team: per district,
 * what was extracted and what became of it, live clinics, 30-day leads and
 * bookings, open and overdue outreach; each operator's work. Leads can open
 * outreach for a whole district from here. 404 for anyone else.
 */

import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { currentPrincipal } from '@/platform/auth/server';
import { can, isAuthenticated } from '@/platform/rbac';
import { commandCenter } from '@/platform/operations/command-center';
import { listOperationsAgents, MANAGE, WORK } from '@/platform/operations/outreach';
import { Card, CardBody, CardHeader, EmptyState, Table } from '@/design-system';
import { BulkOutreach } from './bulk-outreach';

export const metadata: Metadata = { title: 'Operations (staff)', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

export default async function OperationsPage() {
  const principal = await currentPrincipal();
  if (!isAuthenticated(principal)) redirect('/login?next=/admin/operations');
  if (!can(principal, WORK)) notFound();
  const isLead = can(principal, MANAGE);
  const [data, agents] = await Promise.all([commandCenter(principal), isLead ? listOperationsAgents() : Promise.resolve([])]);
  const t = data.totals;
  const tiles: Array<[string, number, string | null]> = [
    ['Records to review', t.toReview, '/admin/data'],
    ['Pre-made dentists (not yet active)', t.premadeDentists, null],
    ['Dentists activated', t.activatedDentists, null],
    ['Unclaimed listings', t.unclaimedListings, null],
    ['Listings claimed', t.claimedListings, null],
    ['Live clinics', t.liveClinics, null],
    ['Leads, last 30 days', t.leads30, null],
    ['Bookings, last 30 days', t.bookings30, null],
    ['Open outreach', t.openTasks, '/admin/operations/tasks?scope=all'],
    ['Overdue outreach', t.overdueTasks, '/admin/operations/tasks?scope=all&overdue=1'],
  ];
  const active = data.districts.filter((d) => d.records + d.liveClinics + d.leads30 + d.openTasks > 0);
  const quiet = data.districts.length - active.length;

  return (
    <div className="tl-container tl-page" style={{ maxWidth: '76rem' }}>
      <header className="tl-page__header">
        <h1>Operations (staff)</h1>
        <p className="tl-page__lead">
          District by district: what came in, what became of it and what is waiting. <Link href="/admin/operations/tasks">My outreach tasks</Link>
        </p>
      </header>

      <Card label="Totals">
        <CardBody>
          <dl className="tl-kv">
            {tiles.map(([label, value, href]) => (
              <div key={label}>
                <dt>{href ? <Link href={href}>{label}</Link> : label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
        </CardBody>
      </Card>

      <Card label="Districts">
        <CardHeader>
          <strong>Districts</strong>
        </CardHeader>
        <CardBody>
          {active.length === 0 ? (
            <EmptyState title="Nothing recorded yet" description="Import directory data for a district to begin." />
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <Table caption={`${active.length} district${active.length === 1 ? '' : 's'} with activity${quiet ? `; ${quiet} with none yet` : ''}`}>
                <thead>
                  <tr>
                    <th scope="col">District</th>
                    <th scope="col">Records</th>
                    <th scope="col">To review</th>
                    <th scope="col">Pre-made / activated dentists</th>
                    <th scope="col">Unclaimed / claimed listings</th>
                    <th scope="col">Live clinics</th>
                    <th scope="col">Leads 30d</th>
                    <th scope="col">Bookings 30d</th>
                    <th scope="col">Open / overdue outreach</th>
                  </tr>
                </thead>
                <tbody>
                  {active.map((d) => (
                    <tr key={d.id}>
                      <td>
                        <Link href={`/admin/operations/tasks?scope=all&districtId=${d.id}`}>{d.name}</Link>
                        <div className="tl-muted">{d.state}</div>
                      </td>
                      <td>{d.records}</td>
                      <td>{d.toReview}</td>
                      <td>
                        {d.premadeDentists} / {d.activatedDentists}
                      </td>
                      <td>
                        {d.unclaimedListings} / {d.claimedListings}
                      </td>
                      <td>{d.liveClinics}</td>
                      <td>{d.leads30}</td>
                      <td>{d.bookings30}</td>
                      <td>
                        {d.openTasks} / {d.overdueTasks}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </div>
          )}
        </CardBody>
      </Card>

      <Card label="Operators">
        <CardHeader>
          <strong>Operators</strong>
        </CardHeader>
        <CardBody>
          {data.agents.length === 0 ? (
            <EmptyState title="No outreach assigned yet" description={isLead ? 'Open outreach for a district below.' : 'Take an unassigned task to begin.'} />
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <Table caption="Outreach by operator">
                <thead>
                  <tr>
                    <th scope="col">Operator</th>
                    <th scope="col">Open</th>
                    <th scope="col">Overdue</th>
                    <th scope="col">Done, 7 days</th>
                    <th scope="col">Calls, 7 days</th>
                  </tr>
                </thead>
                <tbody>
                  {data.agents.map((a) => (
                    <tr key={a.userId}>
                      <td>{a.name}</td>
                      <td>{a.open}</td>
                      <td>{a.overdue}</td>
                      <td>{a.done7}</td>
                      <td>{a.calls7}</td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </div>
          )}
        </CardBody>
      </Card>

      {isLead ? (
        <Card label="Open outreach for a district">
          <CardHeader>
            <strong>Open outreach for a district</strong>
          </CardHeader>
          <CardBody>
            <BulkOutreach districts={data.districts.map((d) => ({ id: d.id, label: `${d.name}, ${d.state}` }))} agents={agents} />
          </CardBody>
        </Card>
      ) : null}
    </div>
  );
}

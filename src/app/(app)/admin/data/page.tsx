/**
 * TL-PAGE-ADMIN-DATA-001 — /admin/data
 *
 * Directory data for Toothlogy staff: import extracted rows and district
 * lists, review each record (the row as received beside its normalized form,
 * district, confidence, duplicate link — always UNVERIFIED), turn it into a
 * pre-made account or unowned listing or reject it, and see coverage per
 * district. 404 for anyone else.
 */

import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { currentPrincipal } from '@/platform/auth/server';
import { can, isAuthenticated } from '@/platform/rbac';
import { listDistricts } from '@/platform/india-data/districts';
import { districtCoverage, listExtractedRecords, listExtractionBatches } from '@/platform/india-data/extraction';
import { Badge, Card, CardBody, CardHeader, EmptyState, Table } from '@/design-system';
import { DistrictImport, ExtractionImport, RecordActions } from './data-console';

export const metadata: Metadata = { title: 'Directory data (staff)', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

const STATUSES = ['NEW', 'DUPLICATE', 'REJECTED', 'ACCOUNT_CREATED', 'CLAIMED', 'ACTIVATED'] as const;
const ENTITIES = ['DENTIST', 'CLINIC', 'HOSPITAL', 'COLLEGE'] as const;
const CREATED = new Set(['ACCOUNT_CREATED', 'CLAIMED', 'ACTIVATED']);

const label = (value: string) => value.toLowerCase().replace(/_/g, ' ');

export default async function AdminDataPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const principal = await currentPrincipal();
  if (!isAuthenticated(principal)) redirect('/login?next=/admin/data');
  if (!can(principal, 'tl.data.extraction.manage')) notFound();
  const sp = await searchParams;
  const pick = <T extends string>(value: unknown, allowed: readonly T[]) => (typeof value === 'string' && (allowed as readonly string[]).includes(value) ? (value as T) : undefined);
  const status = pick(sp.status, STATUSES) ?? (sp.status === 'all' ? undefined : 'NEW');
  const entityType = pick(sp.entityType, ENTITIES);
  const districtId = typeof sp.districtId === 'string' && sp.districtId ? sp.districtId : undefined;

  const [districts, batches, records, coverage] = await Promise.all([
    listDistricts({ countryCode: 'IN' }),
    listExtractionBatches(principal),
    listExtractedRecords(principal, { status, entityType, districtId }),
    districtCoverage(principal),
  ]);
  const when = (d: Date) => new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kolkata' }).format(d);
  const districtName = new Map(districts.map((d) => [d.id, `${d.name}, ${d.state}`]));
  const byDistrict = new Map<string, { total: number; fresh: number; created: number; dentists: number; clinics: number }>();
  for (const row of coverage) {
    const key = row.districtId ?? 'none';
    const entry = byDistrict.get(key) ?? { total: 0, fresh: 0, created: 0, dentists: 0, clinics: 0 };
    entry.total += row.count;
    if (row.status === 'NEW') entry.fresh += row.count;
    if (CREATED.has(row.status)) entry.created += row.count;
    if (row.entityType === 'DENTIST') entry.dentists += row.count;
    else entry.clinics += row.count;
    byDistrict.set(key, entry);
  }
  const query = (next: Record<string, string | undefined>) => {
    const params = new URLSearchParams();
    const merged = { status: status ?? 'all', entityType, districtId, ...next };
    for (const [k, v] of Object.entries(merged)) if (v) params.set(k, v);
    return `/admin/data?${params.toString()}`;
  };

  return (
    <div className="tl-container tl-page" style={{ maxWidth: '72rem' }}>
      <header className="tl-page__header">
        <h1>Directory data (staff)</h1>
        <p className="tl-page__lead">
          Rows imported from directories and vendor files. Every record stays <strong>unverified</strong>: a pre-made dentist account is inactive until the dentist proves the email and mobile on it, and an unowned listing is not public until it is claimed and reviewed.
        </p>
      </header>

      <Card label="Import">
        <CardHeader>
          <strong>Import extracted rows</strong>
        </CardHeader>
        <CardBody>
          <ExtractionImport districts={districts.map((d) => ({ id: d.id, label: `${d.name}, ${d.state}` }))} />
        </CardBody>
      </Card>

      <Card label="Review queue">
        <CardHeader>
          <strong>Review queue</strong>
        </CardHeader>
        <CardBody>
          <div className="tl-stack">
            <nav aria-label="Filter by status" className="tl-inline" style={{ flexWrap: 'wrap' }}>
              {(['all', ...STATUSES] as const).map((s) => {
                const active = (s === 'all' && !status) || s === status;
                return (
                  <Link key={s} href={query({ status: s })} aria-current={active ? 'page' : undefined} className={`tl-button tl-button--sm ${active ? 'tl-button--primary' : 'tl-button--ghost'}`}>
                    <span>{label(s)}</span>
                  </Link>
                );
              })}
            </nav>
            <nav aria-label="Filter by type" className="tl-inline" style={{ flexWrap: 'wrap' }}>
              {([undefined, ...ENTITIES] as const).map((e) => (
                <Link key={e ?? 'any'} href={query({ entityType: e })} aria-current={e === entityType ? 'page' : undefined} className={`tl-button tl-button--sm ${e === entityType ? 'tl-button--secondary' : 'tl-button--ghost'}`}>
                  <span>{e ? label(e) : 'any type'}</span>
                </Link>
              ))}
              {districtId ? (
                <Link href={query({ districtId: '' })} className="tl-button tl-button--sm tl-button--ghost">
                  <span>{districtName.get(districtId) ?? 'District'} ✕</span>
                </Link>
              ) : null}
            </nav>

            {records.length === 0 ? (
              <EmptyState title="Nothing here" description={status ? `No ${label(status)} records match.` : 'No records match.'} />
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <Table caption={`${records.length} record${records.length === 1 ? '' : 's'}${records.length >= 200 ? ' (first 200)' : ''}`}>
                  <thead>
                    <tr>
                      <th scope="col">Record</th>
                      <th scope="col">Contact</th>
                      <th scope="col">District</th>
                      <th scope="col">Confidence</th>
                      <th scope="col">Status</th>
                      <th scope="col">Source</th>
                      <th scope="col">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {records.map((r) => (
                      <tr key={r.id}>
                        <td>
                          <strong>{r.name}</strong>
                          <div className="tl-muted">
                            {label(r.entityType)}
                            {r.registrationNumber ? ` · Reg. ${r.registrationNumber}` : ''}
                          </div>
                          <details>
                            <summary>As received · normalized</summary>
                            <pre className="tl-code" style={{ whiteSpace: 'pre-wrap', maxWidth: '28rem' }}>{JSON.stringify({ original: r.original, normalized: r.normalized }, null, 2)}</pre>
                          </details>
                        </td>
                        <td>
                          {r.phone ?? <span className="tl-muted">no mobile</span>}
                          <div>{r.email ?? <span className="tl-muted">no email</span>}</div>
                        </td>
                        <td>{r.district ? `${r.district.name}, ${r.district.region.name}` : <Badge tone="warning">unmatched</Badge>}</td>
                        <td>{r.confidence}%</td>
                        <td>
                          <div className="tl-inline" style={{ flexWrap: 'wrap' }}>
                            <Badge tone={r.status === 'NEW' ? 'info' : r.status === 'REJECTED' ? 'danger' : r.status === 'DUPLICATE' ? 'warning' : 'success'}>{label(r.status)}</Badge>
                            <Badge tone="neutral">{label(r.verification)}</Badge>
                          </div>
                          {r.rejectionReason ? <div className="tl-muted">{r.rejectionReason}</div> : null}
                          {r.duplicateOfId ? <div className="tl-muted">of an earlier row</div> : null}
                          {r.matchedUserId ? <div className="tl-muted">matches an account</div> : null}
                          {r.matchedOrganizationId ? <div className="tl-muted">matches an organization</div> : null}
                        </td>
                        <td>
                          {r.batch.source}
                          <div className="tl-muted">row {r.rowNumber} · {when(r.extractedAt)}</div>
                        </td>
                        <td>
                          {r.status === 'NEW' || r.status === 'DUPLICATE' ? (
                            <RecordActions recordId={r.id} canCreate={r.status === 'NEW'} entityType={r.entityType} hasContacts={Boolean(r.email && r.phone)} />
                          ) : r.premadeOrganizationId ? (
                            <Link href={`/account/organizations/${r.premadeOrganizationId}`}>Listing</Link>
                          ) : (
                            <span className="tl-muted">—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              </div>
            )}
          </div>
        </CardBody>
      </Card>

      <Card label="Batches">
        <CardHeader>
          <strong>Batches</strong>
        </CardHeader>
        <CardBody>
          {batches.length === 0 ? (
            <EmptyState title="No batches yet" description="Import a file above." />
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <Table caption="Imported batches, newest first">
                <thead>
                  <tr>
                    <th scope="col">Imported</th>
                    <th scope="col">Source</th>
                    <th scope="col">Type</th>
                    <th scope="col">District</th>
                    <th scope="col">Rows</th>
                    <th scope="col">New / duplicate / rejected</th>
                  </tr>
                </thead>
                <tbody>
                  {batches.map((b) => (
                    <tr key={b.id}>
                      <td>{when(b.createdAt)}</td>
                      <td>
                        {b.source}
                        {b.sourceReference ? <div className="tl-muted">{b.sourceReference}</div> : null}
                      </td>
                      <td>{label(b.entityType)}</td>
                      <td>{b.district?.name ?? 'by row'}</td>
                      <td>{b.totalRows}</td>
                      <td>
                        {b.newRows} / {b.duplicateRows} / {b.rejectedRows}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </div>
          )}
        </CardBody>
      </Card>

      <Card label="District coverage">
        <CardHeader>
          <strong>District coverage</strong>
        </CardHeader>
        <CardBody>
          {districts.length === 0 ? (
            <EmptyState title="No districts" description="Import the district list below." />
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <Table caption={`${districts.length} districts`}>
                <thead>
                  <tr>
                    <th scope="col">District</th>
                    <th scope="col">State / UT</th>
                    <th scope="col">Branches on Toothlogy</th>
                    <th scope="col">Records</th>
                    <th scope="col">Dentists / facilities</th>
                    <th scope="col">To review</th>
                    <th scope="col">Accounts made</th>
                  </tr>
                </thead>
                <tbody>
                  {districts.map((d) => {
                    const c = byDistrict.get(d.id);
                    return (
                      <tr key={d.id}>
                        <td>
                          <Link href={query({ districtId: d.id, status: 'all' })}>{d.name}</Link>
                          {d.lgdCode ? <div className="tl-muted">LGD {d.lgdCode}</div> : null}
                        </td>
                        <td>{d.state}</td>
                        <td>{d.locations}</td>
                        <td>{c?.total ?? 0}</td>
                        <td>
                          {c?.dentists ?? 0} / {c?.clinics ?? 0}
                        </td>
                        <td>{c?.fresh ?? 0}</td>
                        <td>{c?.created ?? 0}</td>
                      </tr>
                    );
                  })}
                  {byDistrict.get('none') ? (
                    <tr>
                      <td colSpan={3}>
                        <Link href={query({ status: 'all' })}>No district matched</Link>
                      </td>
                      <td>{byDistrict.get('none')!.total}</td>
                      <td>
                        {byDistrict.get('none')!.dentists} / {byDistrict.get('none')!.clinics}
                      </td>
                      <td>{byDistrict.get('none')!.fresh}</td>
                      <td>{byDistrict.get('none')!.created}</td>
                    </tr>
                  ) : null}
                </tbody>
              </Table>
            </div>
          )}
        </CardBody>
      </Card>

      {can(principal, 'tl.data.geography.manage') ? (
        <Card label="Import districts">
          <CardHeader>
            <strong>Import districts</strong>
          </CardHeader>
          <CardBody>
            <DistrictImport />
          </CardBody>
        </Card>
      ) : null}
    </div>
  );
}

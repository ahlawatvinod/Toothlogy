/**
 * TL-PAGE-ADMIN-COLLEGES-001 — /admin/colleges
 *
 * Colleges' stated recognition, for Toothlogy staff to check against the
 * regulator's list and mark checked — or withdraw that. 404 for anyone else.
 */

import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { currentPrincipal } from '@/platform/auth/server';
import { can, isAuthenticated } from '@/platform/rbac';
import { collegesForReview } from '@/platform/education/colleges';
import { Badge, Card, CardBody, EmptyState, Table } from '@/design-system';
import { RecognitionActions } from './recognition-actions';

export const metadata: Metadata = { title: 'Colleges (staff)', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

export default async function AdminCollegesPage() {
  const principal = await currentPrincipal();
  if (!isAuthenticated(principal)) redirect('/login?next=/admin/colleges');
  if (!can(principal, 'tl.education.recognition.verify')) notFound();
  const colleges = await collegesForReview(principal);
  const when = (d: Date) => new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeZone: 'Asia/Kolkata' }).format(d);

  return (
    <div className="tl-container tl-page" style={{ maxWidth: '64rem' }}>
      <header className="tl-page__header">
        <h1>Colleges (staff)</h1>
        <p className="tl-page__lead">Check each stated recognition against the regulator’s published list before marking it checked. Every decision is audited with what was checked.</p>
      </header>
      <Card label="Colleges">
        <CardBody>
          {colleges.length === 0 ? (
            <EmptyState title="No college profiles yet" description="Colleges appear here once they fill in their profile." />
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <Table caption="Colleges with a profile">
                <thead>
                  <tr>
                    <th scope="col">College</th>
                    <th scope="col">Stated recognition</th>
                    <th scope="col">Published courses</th>
                    <th scope="col">Checked</th>
                    <th scope="col">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {colleges.map((c) => (
                    <tr key={c.id}>
                      <td>
                        <Link href={`/colleges/${c.slug}`}>{c.name}</Link>
                        <div className="tl-muted">{c.ownerUserId ? c.status.toLowerCase() : 'unclaimed'}</div>
                      </td>
                      <td>
                        {c.collegeProfile?.recognitionBody ?? <span className="tl-muted">none stated</span>}
                        {c.collegeProfile?.recognitionReference ? <div className="tl-muted">{c.collegeProfile.recognitionReference}</div> : null}
                      </td>
                      <td>{c._count.courses}</td>
                      <td>{c.collegeProfile?.recognitionVerifiedAt ? <Badge tone="success">{when(c.collegeProfile.recognitionVerifiedAt)}</Badge> : <Badge tone="neutral">no</Badge>}</td>
                      <td>
                        <RecognitionActions organizationId={c.id} verified={Boolean(c.collegeProfile?.recognitionVerifiedAt)} canVerify={Boolean(c.collegeProfile?.recognitionBody && c.collegeProfile.recognitionReference)} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );
}

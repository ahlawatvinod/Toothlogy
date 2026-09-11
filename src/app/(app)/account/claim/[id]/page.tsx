/**
 * TL-PAGE-ORG-CLAIM-001 — /account/claim/:id
 *
 * Claim an unowned clinic listing (one Toothlogy created from public
 * information) with evidence. A claim is a verification request, decided by a
 * reviewer who is never the claimant; nothing is conferred until approval
 * (see platform/organizations/claim.ts). A listing that is already managed,
 * or a claim already awaiting review, is said plainly instead of a form.
 */

import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { currentPrincipal } from '@/platform/auth/server';
import { isAuthenticated } from '@/platform/rbac';
import { db } from '@/platform/db/client';
import { isUnclaimed } from '@/platform/organizations/claim';
import { Alert, Card, CardBody, CardHeader } from '@/design-system';
import { ClaimForm } from './claim-form';

export const metadata: Metadata = { title: 'Claim a clinic listing', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

export default async function ClaimListingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const principal = await currentPrincipal();
  if (!isAuthenticated(principal)) redirect(`/login?next=${encodeURIComponent(`/account/claim/${id}`)}`);

  const organization = await db().organization.findFirst({ where: { id, deletedAt: null }, select: { id: true, name: true, slug: true } });
  if (!organization) notFound();

  const [unclaimed, pending] = await Promise.all([
    isUnclaimed(id),
    db().verificationRequest.findFirst({
      where: { subjectType: 'ORGANIZATION_CLAIM', subjectId: id, submittedByUserId: principal.userId, status: { in: ['PENDING', 'IN_REVIEW'] } },
      select: { id: true },
    }),
  ]);

  return (
    <div className="tl-page">
      <nav aria-label="Breadcrumb" className="tl-breadcrumb">
        <Link href={`/clinics/${organization.slug}`}>{organization.name}</Link>
        <span aria-hidden="true"> / </span>
        <span aria-current="page">Claim this listing</span>
      </nav>
      <header className="tl-page__header">
        <h1>Claim {organization.name}</h1>
        <p className="tl-page__lead">
          If you run this clinic, claim its listing to manage it on Toothlogy. A Toothlogy reviewer checks your documents first — a claim
          without evidence is how a listing gets taken over.
        </p>
      </header>

      {!unclaimed ? (
        <Alert tone="info" title="This clinic is already managed on Toothlogy">
          Ask its administrators to invite you.
        </Alert>
      ) : pending ? (
        <Alert tone="info" title="Your claim is awaiting review">
          A reviewer will check your documents. You will be told the outcome in your notifications.
        </Alert>
      ) : (
        <Card label="Your claim">
          <CardHeader>
            <strong>Your claim</strong>
          </CardHeader>
          <CardBody>
            <ClaimForm organizationId={id} clinicSlug={organization.slug} />
          </CardBody>
        </Card>
      )}
    </div>
  );
}

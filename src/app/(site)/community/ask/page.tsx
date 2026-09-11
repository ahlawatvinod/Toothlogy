/**
 * TL-PAGE-COMMUNITY-ASK-001 — /community/ask
 *
 * Ask the community. Signed in with a verified email; the form says so
 * before anyone types a question that cannot be sent.
 */

import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { currentPrincipal } from '@/platform/auth/server';
import { isAuthenticated } from '@/platform/rbac';
import { db } from '@/platform/db/client';
import { COMMUNITY_TOPICS } from '@/platform/community/service';
import { Card, CardBody } from '@/design-system';
import { AskForm } from './ask-form';

export const metadata: Metadata = { title: 'Ask the community', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

export default async function AskPage() {
  const principal = await currentPrincipal();
  if (!isAuthenticated(principal)) redirect('/login?next=/community/ask');
  const user = await db().user.findUnique({ where: { id: principal.userId }, select: { emailVerifiedAt: true } });

  return (
    <div className="tl-container tl-page" style={{ maxWidth: '44rem' }}>
      <nav aria-label="Breadcrumb" className="tl-breadcrumb">
        <Link href="/community">Community</Link>
        <span aria-hidden="true"> / </span>
        <span aria-current="page">Ask</span>
      </nav>
      <header className="tl-page__header">
        <h1>Ask the community</h1>
        <p className="tl-page__lead">Your question is public, under your display name. Do not include phone numbers, email addresses or anything that identifies someone else.</p>
      </header>
      <Card label="Your question">
        <CardBody>{user?.emailVerifiedAt ? <AskForm topics={COMMUNITY_TOPICS.map((t) => ({ key: t.key, label: t.label }))} /> : <p style={{ margin: 0 }}>Verify your email address first. Look for the link we sent, or ask for a new one on your account page.</p>}</CardBody>
      </Card>
    </div>
  );
}

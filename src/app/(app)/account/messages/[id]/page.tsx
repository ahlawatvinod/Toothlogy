/**
 * TL-PAGE-MY-THREAD-001 — /account/messages/:id
 *
 * One conversation, for its patient (practice members are sent to the
 * practice view of it). Opening it marks it read.
 */

import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { currentPrincipal } from '@/platform/auth/server';
import { isAuthenticated } from '@/platform/rbac';
import { getThread } from '@/platform/messaging/service';
import { isAppError } from '@/platform/kernel/errors';
import { ThreadView } from '@/components/messaging/thread-view';

export const metadata: Metadata = { title: 'Conversation', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

export default async function MyThreadPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const principal = await currentPrincipal();
  if (!isAuthenticated(principal)) redirect(`/login?next=/account/messages/${id}`);
  const data = await getThread(principal, id).catch((error) => {
    if (isAppError(error) && error.code === 'NOT_FOUND') return null;
    throw error;
  });
  if (!data) notFound();
  if (data.side === 'PRACTICE') redirect(`/account/practice/messages/${id}`);

  return (
    <div className="tl-page">
      <nav aria-label="Breadcrumb" className="tl-breadcrumb">
        <Link href="/account/messages">Messages</Link>
      </nav>
      <ThreadView data={data} appointmentHref={data.thread.appointment ? `/account/appointments/${data.thread.appointment.id}` : null} />
    </div>
  );
}

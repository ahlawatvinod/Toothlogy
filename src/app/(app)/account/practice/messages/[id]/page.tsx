/**
 * TL-PAGE-PRACTICE-THREAD-001 — /account/practice/messages/:id
 *
 * One conversation from the practice side: reply and close for members who
 * may reply; read-only for those who may only read. Opening it marks it
 * read for the practice.
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

export default async function PracticeThreadPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const principal = await currentPrincipal();
  if (!isAuthenticated(principal)) redirect(`/login?next=/account/practice/messages/${id}`);
  const data = await getThread(principal, id).catch((error) => {
    if (isAppError(error) && error.code === 'NOT_FOUND') return null;
    throw error;
  });
  if (!data) notFound();
  if (data.side === 'PATIENT') redirect(`/account/messages/${id}`);

  return (
    <div className="tl-page">
      <nav aria-label="Breadcrumb" className="tl-breadcrumb">
        <Link href="/account/practice/messages">Practice messages</Link>
      </nav>
      <ThreadView data={data} appointmentHref={data.thread.appointment ? `/account/practice/appointments/${data.thread.appointment.id}` : null} />
    </div>
  );
}

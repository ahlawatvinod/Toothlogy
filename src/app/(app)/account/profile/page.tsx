/**
 * TL-PAGE-ACCOUNT-PROFILE-001 — /account/profile
 *
 * Name, photo and contact details. Contact details are where verification
 * lives: an unverified email or phone receives nothing from Toothlogy except
 * the message that verifies it, so the page makes the state unmistakable.
 */

import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { currentPrincipal } from '@/platform/auth/server';
import { isAuthenticated } from '@/platform/rbac';
import { db } from '@/platform/db/client';
import { emailProvider, smsProvider } from '@/platform/notifications/ports';
import { ProfileClient } from './profile-client';

export const metadata: Metadata = { title: 'Profile', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

export default async function ProfilePage() {
  const principal = await currentPrincipal();
  if (!isAuthenticated(principal)) redirect('/login?next=/account/profile');

  const user = await db().user.findUnique({
    where: { id: principal.userId },
    select: {
      displayName: true,
      email: true,
      emailVerifiedAt: true,
      phone: true,
      phoneVerifiedAt: true,
      avatarFileId: true,
    },
  });
  if (!user) redirect('/login');

  return (
    <div className="tl-page">
      <header className="tl-page__header">
        <h1>Profile</h1>
        <p className="tl-page__lead">How you appear on Toothlogy, and how we reach you.</p>
      </header>
      <ProfileClient
        user={{
          displayName: user.displayName ?? '',
          email: user.email,
          emailVerified: user.emailVerifiedAt !== null,
          phone: user.phone,
          phoneVerified: user.phoneVerifiedAt !== null,
          avatarFileId: user.avatarFileId,
        }}
        // Whether the server can send at all — so the page can say "email is
        // not set up" instead of "check your inbox" for a mail that won't come.
        delivery={{ email: emailProvider.isConfigured(), sms: smsProvider.isConfigured() }}
      />
    </div>
  );
}

/**
 * Account centre layout.
 *
 * Server component: resolves the principal once, decides which navigation
 * entries this user gets from their PERMISSIONS (never from a role string the
 * client could fake), counts unread notifications, and carries the user's
 * saved presentation preferences onto this device.
 */

import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { currentPrincipal } from '@/platform/auth/server';
import { can, isAuthenticated } from '@/platform/rbac';
import { db } from '@/platform/db/client';
import { getPreferences } from '@/platform/users/preferences';
import { AccountNav, type AccountNavItem } from '@/components/account/account-nav';
import { PreferenceSync } from '@/components/preferences/preference-sync';

export default async function AccountLayout({ children }: { children: ReactNode }) {
  const principal = await currentPrincipal();
  if (!isAuthenticated(principal)) redirect('/login?next=/account');

  const [prefs, unread, memberships, practices] = await Promise.all([
    getPreferences(principal.userId),
    db().inAppNotification.count({ where: { userId: principal.userId, readAt: null } }),
    db().organizationMember.count({ where: { userId: principal.userId, leftAt: null } }),
    db().dentistPractice.count({ where: { dentistProfile: { userId: principal.userId }, location: { deletedAt: null } } }),
  ]);
  // A practice diary exists for a dentist with a practice, or for anyone who
  // may run an organization's appointments.
  const runsDiary =
    practices > 0 ||
    principal.organizations.some((o) => can(principal, 'tl.appointment.diary.manage', { organizationId: o.organizationId }));

  const items: AccountNavItem[] = [
    { href: '/account', label: 'Overview' },
    { href: '/account/appointments', label: 'Appointments' },
    { href: '/account/records', label: 'Dental record' },
    { href: '/account/notifications', label: 'Notifications', badge: unread > 0 ? String(Math.min(unread, 99)) : undefined },
    { href: '/account/profile', label: 'Profile' },
    { href: '/account/preferences', label: 'Preferences' },
    { href: '/account/security', label: 'Security' },
    { href: '/account/privacy', label: 'Privacy & data' },
  ];
  if (can(principal, 'tl.dentist.profile.manage.self')) {
    items.push({ href: '/account/dentist-profile', label: 'Dentist profile' });
  }
  items.push({
    href: memberships > 0 ? '/account/organizations' : '/account/organizations/new',
    label: 'Organizations',
  });
  if (runsDiary) {
    items.push({ href: '/account/practice', label: 'Practice' });
  }
  if (can(principal, 'tl.verification.request.review')) {
    items.push({ href: '/admin/verification', label: 'Verification queue' });
  }
  if (can(principal, 'tl.billing.ledger.adjust') || can(principal, 'tl.billing.dispute.resolve')) {
    items.push({ href: '/admin/billing', label: 'Billing (staff)' });
  }
  items.push({ href: '/account/messages', label: 'Messages' });
  if (principal.organizations.some((o) => can(principal, 'tl.messaging.thread.read', { organizationId: o.organizationId }))) {
    items.push({ href: '/account/practice/messages', label: 'Practice messages' });
  }
  if (can(principal, 'tl.support.ticket.work')) {
    items.push({ href: '/admin/support', label: 'Support (staff)' });
  }
  items.push({ href: '/account/reviews', label: 'My reviews' });
  if (runsDiary || can(principal, 'tl.reviews.review.respond', { organizationId: principal.organizations[0]?.organizationId ?? '' })) {
    items.push({ href: '/account/practice/reviews', label: 'Practice reviews' });
  }
  if (can(principal, 'tl.reviews.review.moderate')) {
    items.push({ href: '/admin/reviews', label: 'Reviews (staff)' });
  }
  items.push({ href: '/account/camps', label: 'My camps' });
  items.push({ href: '/account/orders', label: 'My orders' });
  items.push({ href: '/account/applications', label: 'Job applications' });
  if (can(principal, 'tl.knowledge.article.write')) {
    items.push({ href: '/account/articles', label: 'My articles' });
  }
  if (can(principal, 'tl.knowledge.article.review')) {
    items.push({ href: '/admin/knowledge', label: 'Articles (review)' });
  }
  if (principal.roles.includes('dentist') || principal.roles.includes('student')) {
    items.push({ href: '/account/academic', label: 'Academic profile' });
  }
  if (can(principal, 'tl.community.post.moderate')) {
    items.push({ href: '/admin/community', label: 'Community (staff)' });
  }
  if (can(principal, 'tl.camps.camp.approve')) {
    items.push({ href: '/admin/camps', label: 'Camps (staff)' });
  }
  if (can(principal, 'tl.education.recognition.verify')) {
    items.push({ href: '/admin/colleges', label: 'Colleges (staff)' });
  }
  if (can(principal, 'tl.ops.outreach.work')) {
    items.push({ href: '/admin/operations', label: 'Operations (staff)' });
  }
  if (can(principal, 'tl.prime.plan.manage')) {
    items.push({ href: '/admin/prime', label: 'Prime plans (staff)' });
  }
  if (can(principal, 'tl.admin.enterprise.manage')) {
    items.push({ href: '/admin/enterprise', label: 'Enterprise (staff)' });
  }
  if (can(principal, 'tl.admin.fx_rate.manage')) {
    items.push({ href: '/admin/exchange-rates', label: 'Exchange rates (staff)' });
  }
  if (can(principal, 'tl.admin.country.manage')) {
    items.push({ href: '/admin/countries', label: 'Countries (staff)' });
  }
  if (can(principal, 'tl.analytics.platform.read')) {
    items.push({ href: '/admin/analytics', label: 'Platform analytics (staff)' });
  }
  if (can(principal, 'tl.data.extraction.manage')) {
    items.push({ href: '/admin/data', label: 'Directory data (staff)' });
  }

  return (
    <div className="tl-container tl-account-layout">
      <PreferenceSync
        prefs={{
          theme: prefs.theme,
          palette: prefs.palette as 'teal',
          contrast: prefs.highContrast ? 'more' : 'normal',
          motion: prefs.reducedMotion ? 'reduce' : 'normal',
          textScale: prefs.textScale,
        }}
      />
      <aside className="tl-account-layout__nav">
        <AccountNav items={items} />
      </aside>
      <div className="tl-account-layout__content">{children}</div>
    </div>
  );
}

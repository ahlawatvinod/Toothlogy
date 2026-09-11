/**
 * TOOTHLOGY ROLE REGISTRY
 *
 * Roles bundle permissions. A principal's effective permission set is the union
 * of the permissions of every role assigned to them, plus the permissions of the
 * roles those roles inherit, resolved transitively.
 *
 * Two rules keep this from decaying into an unauditable mess:
 *
 * 1. Roles grant; they never deny. There is no negative permission. If a role
 *    should not have something, do not grant it — default deny does the rest
 *    (Constitution §9).
 * 2. Inheritance is acyclic and asserted by the registry integrity test. A cycle
 *    would make the effective permission set undecidable.
 *
 * `assignable: false` marks roles that no human may be granted through the admin
 * UI — `guest` is implicit for anonymous requests, and `system` belongs to
 * internal jobs only.
 */

import type { Role } from './types';

export const ROLES: readonly Role[] = [
  {
    id: 'TL-ROLE-GUEST-001',
    key: 'guest',
    name: 'Guest',
    description:
      'An anonymous visitor. Holds no permissions at all: every public surface must work without any permission check, so a public page grants access by requiring nothing rather than by granting something.',
    permissions: [],
    inherits: [],
    assignable: false,
  },
  {
    id: 'TL-ROLE-USER-001',
    key: 'user',
    name: 'Authenticated User',
    description:
      'The base role every authenticated principal holds, regardless of what kind of constituent they are. Grants control over your own account and nothing else.',
    permissions: [
      'tl.core.user.read.self',
      'tl.core.user.update.self',
      'tl.core.session.read.self',
      'tl.core.session.revoke.self',
      'tl.security.audit.read.self',
      'tl.appointment.book.self',
    ],
    inherits: [],
    assignable: false,
  },
  {
    id: 'TL-ROLE-PATIENT-001',
    key: 'patient',
    name: 'Patient',
    description:
      'A patient using Toothlogy to learn, discover, book and hold their own records. Record-specific permissions arrive with Division 11 in Phase 6.',
    permissions: [],
    inherits: ['user'],
    assignable: true,
  },
  {
    id: 'TL-ROLE-DENTIST-001',
    key: 'dentist',
    name: 'Dentist',
    description:
      'A practising dentist with a professional profile. Manages their own profile and credentials; verification is decided by staff, never by the applicant.',
    permissions: ['tl.core.organization.read', 'tl.dentist.profile.manage.self', 'tl.camps.camp.organize', 'tl.knowledge.article.write'],
    inherits: ['user'],
    assignable: true,
  },
  {
    id: 'TL-ROLE-CLINIC-ADMIN-001',
    key: 'clinic_admin',
    name: 'Clinic Administrator',
    description:
      'Manages a clinic or hospital organization: its profile, staff, locations, services and the dentists who practise there. Scoped to organizations they belong to, never global.',
    permissions: [
      'tl.core.organization.read',
      'tl.core.organization.manage',
      'tl.clinic.practice.confirm',
      'tl.clinic.service.manage',
      'tl.appointment.diary.manage',
      'tl.appointment.availability.manage',
      'tl.leads.lead.read',
      'tl.leads.lead.manage',
      'tl.billing.wallet.read',
      'tl.billing.dispute.raise',
      'tl.advertising.campaign.manage',
      'tl.education.course.manage',
      'tl.education.enquiry.read',
      'tl.education.enquiry.manage',
      'tl.marketplace.catalogue.manage',
      'tl.marketplace.quote.read',
      'tl.marketplace.quote.manage',
      'tl.marketplace.order.read',
      'tl.marketplace.order.manage',
      'tl.equipment.asset.read',
      'tl.equipment.asset.manage',
      'tl.equipment.contract.manage',
      'tl.prime.membership.manage',
      'tl.enterprise.agreement.read',
      'tl.education.faculty.confirm',
      'tl.reviews.review.respond',
      'tl.messaging.thread.read',
      'tl.messaging.thread.reply',
      'tl.records.record.read',
      'tl.records.record.write',
      'tl.records.prescription.issue',
      'tl.careers.posting.manage',
      'tl.careers.application.read',
      'tl.careers.application.manage',
      'tl.analytics.practice.read',
      'tl.iot.device.read',
      'tl.iot.device.manage',
      'tl.education.enrolment.manage',
    ],
    inherits: ['user'],
    assignable: true,
  },
  {
    id: 'TL-ROLE-CLINICIAN-001',
    key: 'clinician',
    name: 'Clinician',
    description:
      'A dentist or clinical assistant at a practice. Runs the diary, answers patients, and reads and adds to the dental records patients have shared with the practice; issues prescriptions only if Toothlogy has verified their dentist credentials. Front-desk staff (clinic_staff) do not see clinical records.',
    permissions: [
      'tl.core.organization.read',
      'tl.appointment.diary.manage',
      'tl.messaging.thread.read',
      'tl.messaging.thread.reply',
      'tl.records.record.read',
      'tl.records.record.write',
      'tl.records.prescription.issue',
      'tl.iot.device.read',
      'tl.equipment.asset.read',
    ],
    inherits: ['user'],
    assignable: true,
  },
  {
    id: 'TL-ROLE-CLINIC-STAFF-001',
    key: 'clinic_staff',
    name: 'Clinic Staff',
    description:
      'Front-desk and support staff at a clinic. Reads organization data and runs the appointment diary; does not manage the organization or its billing.',
    permissions: ['tl.core.organization.read', 'tl.appointment.diary.manage', 'tl.leads.lead.read', 'tl.education.enquiry.read', 'tl.marketplace.quote.read', 'tl.marketplace.order.read', 'tl.messaging.thread.read', 'tl.messaging.thread.reply', 'tl.iot.device.read', 'tl.equipment.asset.read'],
    inherits: ['user'],
    assignable: true,
  },
  {
    id: 'TL-ROLE-STUDENT-001',
    key: 'student',
    name: 'Student',
    description:
      'A dental student or intern: enquires about courses, applies for internships and jobs (open to anyone signed in with a verified email), and keeps an academic profile. Needs no special permission for any of it.',
    permissions: [],
    inherits: ['user'],
    assignable: true,
  },
  {
    id: 'TL-ROLE-SUPPLIER-001',
    key: 'supplier',
    name: 'Supplier',
    description:
      'A manufacturer, distributor, wholesaler, retailer or service provider. Catalogue and order permissions arrive with Divisions 16–19 in Phase 9.',
    permissions: ['tl.core.organization.read', 'tl.core.organization.manage'],
    inherits: ['user'],
    assignable: true,
  },
  {
    id: 'TL-ROLE-SUPPORT-001',
    key: 'support_agent',
    name: 'Support Agent',
    description:
      'Platform support staff. May read user accounts to resolve tickets — a confidential, fully audited capability, deliberately separated from the ability to change anything.',
    permissions: ['tl.admin.console.access', 'tl.core.user.read.any', 'tl.ops.outreach.work', 'tl.support.ticket.work'],
    inherits: ['user'],
    assignable: true,
  },
  {
    id: 'TL-ROLE-CAMP-ORGANIZER-001',
    key: 'camp_organizer',
    name: 'Camp Organizer',
    description:
      'Runs district dental camps without being a dentist or a clinic administrator — an NGO, a school, a panchayat health worker. Organizes camps; every camp still needs staff approval before it is public.',
    permissions: ['tl.camps.camp.organize'],
    inherits: ['user'],
    assignable: true,
  },
  {
    id: 'TL-ROLE-MEDICAL-REVIEWER-001',
    key: 'medical_reviewer',
    name: 'Medical Reviewer',
    description:
      'A dentist or clinician Toothlogy has appointed to check knowledge articles for clinical accuracy and sourcing before they are published. Reviews other people’s articles, never their own.',
    permissions: ['tl.knowledge.article.review'],
    inherits: ['user'],
    assignable: true,
  },
  {
    id: 'TL-ROLE-MODERATOR-001',
    key: 'moderator',
    name: 'Moderator',
    description:
      'Reviews verification submissions and content. Holds review but NOT revoke: withdrawing a live verification removes a dentist from patient search, which is a heavier action reserved for administrators.',
    permissions: ['tl.admin.console.access', 'tl.verification.request.review', 'tl.camps.camp.approve', 'tl.community.post.moderate', 'tl.reviews.review.moderate'],
    inherits: ['user'],
    assignable: true,
  },
  {
    id: 'TL-ROLE-ADMIN-001',
    key: 'platform_admin',
    name: 'Platform Administrator',
    description:
      'Full platform administration, including role assignment and feature-flag control. The smallest possible number of people hold this; every action is audited.',
    permissions: [
      'tl.core.user.read.any',
      'tl.core.user.suspend',
      'tl.core.role.assign',
      'tl.admin.console.access',
      'tl.admin.flag.read',
      'tl.admin.flag.manage',
      'tl.admin.registry.read',
      'tl.security.audit.read',
      'tl.devops.health.read',
      'tl.devops.jobs.run',
      'tl.verification.request.review',
      'tl.verification.request.revoke',
      'tl.billing.ledger.adjust',
      'tl.billing.dispute.resolve',
      'tl.advertising.campaign.administer',
      'tl.data.extraction.manage',
      'tl.data.geography.manage',
      'tl.ops.outreach.work',
      'tl.ops.outreach.manage',
      'tl.education.recognition.verify',
      'tl.camps.camp.organize',
      'tl.camps.camp.approve',
      'tl.community.post.moderate',
      'tl.reviews.review.moderate',
      'tl.support.ticket.work',
      'tl.knowledge.article.review',
      'tl.analytics.platform.read',
      'tl.admin.country.manage',
      'tl.prime.plan.manage',
      'tl.admin.fx_rate.manage',
      'tl.admin.enterprise.manage',
    ],
    inherits: ['user'],
    assignable: true,
  },
  {
    id: 'TL-ROLE-SYSTEM-001',
    key: 'system',
    name: 'System',
    description:
      'Internal background jobs and scheduled tasks. Never assignable to a human, and never used to bypass a permission check that a human action would face.',
    permissions: [],
    inherits: [],
    assignable: false,
  },
] as const;

export const ROLE_BY_KEY: ReadonlyMap<string, Role> = new Map(ROLES.map((r) => [r.key, r]));

export type RoleKey = (typeof ROLES)[number]['key'];

/**
 * Resolve a role's full permission set, following `inherits` transitively.
 *
 * Cycles cannot occur — the registry integrity test forbids them — but the
 * `seen` set keeps this function total even if the registry is edited wrongly,
 * so a bad edit fails a test rather than hanging a request.
 */
export function resolveRolePermissions(
  roleKey: string,
  seen: Set<string> = new Set(),
): Set<string> {
  const out = new Set<string>();
  if (seen.has(roleKey)) return out;
  seen.add(roleKey);

  const role = ROLE_BY_KEY.get(roleKey);
  if (!role) return out;

  for (const p of role.permissions) out.add(p);
  for (const parent of role.inherits) {
    for (const p of resolveRolePermissions(parent, seen)) out.add(p);
  }
  return out;
}

/** Effective permissions for a principal holding several roles. */
export function resolvePermissionsForRoles(roleKeys: readonly string[]): Set<string> {
  const out = new Set<string>();
  for (const key of roleKeys) {
    for (const p of resolveRolePermissions(key)) out.add(p);
  }
  return out;
}

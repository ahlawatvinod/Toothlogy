/**
 * TOOTHLOGY PERMISSION REGISTRY
 *
 * Permission keys are dotted and structured:
 *
 *     tl.<division-slug>.<resource>.<action>[.<qualifier>]
 *
 * Keys are stable and never reused (Constitution P6). Renaming a permission is a
 * breaking change: it silently widens or narrows access, so it requires a
 * migration of every RoleAssignment that referenced it.
 *
 * SCOPE decides *what* the permission is evaluated against:
 *   - 'self'          the principal's own resource only
 *   - 'organization'  resources belonging to an organization the principal is a member of
 *   - 'global'        platform-wide; only ever granted to staff roles
 *
 * This registry contains the FOUNDATION permissions only — those the Phase 0/1
 * platform actually evaluates. Each division adds its own permissions in its own
 * phase. Registering a permission here is not a claim that any feature uses it.
 */

import type { Permission } from './types';

export const PERMISSIONS: readonly Permission[] = [
  // --- Division 01: Core — identity and account ---------------------------
  {
    key: 'tl.core.user.read.self',
    description: 'Read your own user account and profile.',
    divisionId: 'TL-DIV-01-CORE',
    scope: 'self',
    sensitivity: 'internal',
  },
  {
    key: 'tl.core.user.update.self',
    description: 'Update your own user account and profile.',
    divisionId: 'TL-DIV-01-CORE',
    scope: 'self',
    sensitivity: 'internal',
  },
  {
    key: 'tl.core.user.read.any',
    description: 'Read any user account. Staff-only; every use is audited.',
    divisionId: 'TL-DIV-01-CORE',
    scope: 'global',
    sensitivity: 'confidential',
  },
  {
    key: 'tl.core.user.suspend',
    description: 'Suspend or reinstate a user account.',
    divisionId: 'TL-DIV-01-CORE',
    scope: 'global',
    sensitivity: 'confidential',
  },
  {
    key: 'tl.core.session.read.self',
    description: 'List your own active sessions.',
    divisionId: 'TL-DIV-01-CORE',
    scope: 'self',
    sensitivity: 'internal',
  },
  {
    key: 'tl.core.session.revoke.self',
    description: 'Revoke your own sessions on any device.',
    divisionId: 'TL-DIV-01-CORE',
    scope: 'self',
    sensitivity: 'internal',
  },
  {
    key: 'tl.core.organization.read',
    description: 'Read organizations you are a member of.',
    divisionId: 'TL-DIV-01-CORE',
    scope: 'organization',
    sensitivity: 'internal',
  },
  {
    key: 'tl.core.organization.manage',
    description: 'Manage organization settings and membership.',
    divisionId: 'TL-DIV-01-CORE',
    scope: 'organization',
    sensitivity: 'confidential',
  },
  {
    key: 'tl.core.role.assign',
    description: 'Assign or revoke roles. The most privilege-sensitive permission in the platform.',
    divisionId: 'TL-DIV-01-CORE',
    scope: 'global',
    sensitivity: 'confidential',
  },

  // --- Division 33: Security & Compliance ---------------------------------
  {
    key: 'tl.security.audit.read',
    description: 'Read the append-only audit log.',
    divisionId: 'TL-DIV-33-SECURITY',
    scope: 'global',
    sensitivity: 'confidential',
  },
  {
    key: 'tl.security.audit.read.self',
    description: 'Read audit entries about your own account and data.',
    divisionId: 'TL-DIV-33-SECURITY',
    scope: 'self',
    sensitivity: 'internal',
  },

  // --- Division 32: Administration ----------------------------------------
  {
    key: 'tl.admin.console.access',
    description: 'Access the internal administration console at all.',
    divisionId: 'TL-DIV-32-ADMIN',
    scope: 'global',
    sensitivity: 'confidential',
  },
  {
    key: 'tl.admin.flag.read',
    description: 'Read feature-flag state.',
    divisionId: 'TL-DIV-32-ADMIN',
    scope: 'global',
    sensitivity: 'internal',
  },
  {
    key: 'tl.admin.flag.manage',
    description: 'Change feature-flag state. Gated behind the console-access permission.',
    divisionId: 'TL-DIV-32-ADMIN',
    scope: 'global',
    sensitivity: 'confidential',
  },
  {
    key: 'tl.admin.registry.read',
    description: 'Read the architecture registry through the introspection API.',
    divisionId: 'TL-DIV-32-ADMIN',
    scope: 'global',
    sensitivity: 'internal',
  },

  // --- Division 35: DevOps & System ---------------------------------------
  {
    key: 'tl.devops.health.read',
    description: 'Read detailed system health, including dependency status.',
    divisionId: 'TL-DIV-35-DEVOPS',
    scope: 'global',
    sensitivity: 'internal',
  },
  {
    key: 'tl.devops.jobs.run',
    description: 'List and run background jobs by hand, and replay dead outbox events.',
    divisionId: 'TL-DIV-35-DEVOPS',
    scope: 'global',
    sensitivity: 'confidential',
  },

  // --- Division 04: Dentists (Phase 3) ------------------------------------
  {
    key: 'tl.dentist.profile.manage.self',
    description: 'Create and edit your own dentist profile, qualifications and practices.',
    divisionId: 'TL-DIV-04-DENTISTS',
    scope: 'self',
    sensitivity: 'internal',
  },

  // --- Division 05: Clinics (Phase 3) -------------------------------------
  {
    key: 'tl.clinic.practice.confirm',
    description:
      'Confirm that a dentist practises at one of this organization’s locations. Without confirmation any dentist could claim to work anywhere.',
    divisionId: 'TL-DIV-05-CLINICS',
    scope: 'organization',
    sensitivity: 'confidential',
  },
  {
    key: 'tl.clinic.service.manage',
    description: 'Manage the treatments and prices offered at this organization’s locations.',
    divisionId: 'TL-DIV-05-CLINICS',
    scope: 'organization',
    sensitivity: 'internal',
  },

  // --- Division 26: Reviews & Trust (Phase 3 verification) ----------------
  {
    key: 'tl.verification.request.review',
    description:
      'Approve or reject verification requests. Staff-only, and a reviewer may never decide their own application.',
    divisionId: 'TL-DIV-26-REVIEWS',
    scope: 'global',
    sensitivity: 'confidential',
  },
  {
    key: 'tl.verification.request.revoke',
    description:
      'Withdraw an approved verification. Separated from review because revocation removes a live dentist from patient search.',
    divisionId: 'TL-DIV-26-REVIEWS',
    scope: 'global',
    sensitivity: 'confidential',
  },

  // --- Division 09: Appointments (Phase 4) -----------------------------------
  {
    key: 'tl.appointment.book.self',
    description: 'Book, move, cancel and check in to your own appointments, and join waitlists.',
    divisionId: 'TL-DIV-09-APPOINTMENTS',
    scope: 'self',
    sensitivity: 'confidential',
  },
  {
    key: 'tl.appointment.diary.manage',
    description:
      'Run the appointment diary of an organization: confirm, decline, move, check in, complete and record no-shows. A dentist always manages their own appointments without it.',
    divisionId: 'TL-DIV-09-APPOINTMENTS',
    scope: 'organization',
    sensitivity: 'confidential',
  },
  {
    key: 'tl.appointment.availability.manage',
    description: 'Set the working sessions, leave and blocked time of the dentists at an organization’s branches.',
    divisionId: 'TL-DIV-09-APPOINTMENTS',
    scope: 'organization',
    sensitivity: 'internal',
  },

  // --- Division 20: Leads (Phase 4) ------------------------------------------
  {
    key: 'tl.leads.lead.read',
    description: 'See an organization’s leads. Patient contact details appear only once a lead is paid for.',
    divisionId: 'TL-DIV-20-LEADS',
    scope: 'organization',
    sensitivity: 'confidential',
  },
  {
    key: 'tl.leads.lead.manage',
    description: 'Accept, decline and progress an organization’s leads.',
    divisionId: 'TL-DIV-20-LEADS',
    scope: 'organization',
    sensitivity: 'confidential',
  },

  // --- Division 23: Payments and billing (Phase 4) ---------------------------
  {
    key: 'tl.billing.wallet.read',
    description: 'See an organization’s lead wallet, ledger, invoices and disputes, and start a top-up.',
    divisionId: 'TL-DIV-23-PAYMENTS',
    scope: 'organization',
    sensitivity: 'confidential',
  },
  {
    key: 'tl.billing.dispute.raise',
    description: 'Dispute a lead charge for an organization.',
    divisionId: 'TL-DIV-23-PAYMENTS',
    scope: 'organization',
    sensitivity: 'confidential',
  },
  {
    key: 'tl.data.extraction.manage',
    description: 'Toothlogy staff: import extracted directory data, review it, and turn records into pre-made accounts or unowned listings. Extracted data stays UNVERIFIED.',
    divisionId: 'TL-DIV-32-ADMIN',
    scope: 'global',
    sensitivity: 'confidential',
  },
  {
    key: 'tl.messaging.thread.read',
    description: 'Read a practice’s conversations with its patients.',
    divisionId: 'TL-DIV-25-COMMUNICATION',
    scope: 'organization',
    sensitivity: 'confidential',
  },
  {
    key: 'tl.messaging.thread.reply',
    description: 'Reply to a practice’s conversations with its patients, and close them.',
    divisionId: 'TL-DIV-25-COMMUNICATION',
    scope: 'organization',
    sensitivity: 'confidential',
  },
  {
    key: 'tl.records.record.read',
    description: 'Read the dental record of a patient whose grant to the practice is active (every view is audited and shown to the patient), and ask a patient for access.',
    divisionId: 'TL-DIV-11-RECORDS',
    scope: 'organization',
    sensitivity: 'phi',
  },
  {
    key: 'tl.records.record.write',
    description: 'Add to a patient’s dental record under a grant that allows adding, and retract the practice’s own entries with a reason.',
    divisionId: 'TL-DIV-11-RECORDS',
    scope: 'organization',
    sensitivity: 'phi',
  },
  {
    key: 'tl.records.prescription.issue',
    description: 'Issue and cancel prescriptions under a grant that allows adding — and only for a dentist whose credentials Toothlogy has verified.',
    divisionId: 'TL-DIV-12-PRESCRIPTIONS',
    scope: 'organization',
    sensitivity: 'phi',
  },
  {
    key: 'tl.admin.country.manage',
    description: 'Toothlogy staff: see every modelled country’s readiness and open a country for new organizations (only once it is fully configured) or close it.',
    divisionId: 'TL-DIV-29-LOCATION',
    scope: 'global',
    sensitivity: 'internal',
  },
  {
    key: 'tl.iot.device.read',
    description: 'See the practice’s connected equipment, its readings and alerts.',
    divisionId: 'TL-DIV-28-IOT',
    scope: 'organization',
    sensitivity: 'internal',
  },
  {
    key: 'tl.iot.device.manage',
    description: 'Register, re-key and retire the practice’s connected equipment, set its limits and resolve its alerts.',
    divisionId: 'TL-DIV-28-IOT',
    scope: 'organization',
    sensitivity: 'internal',
  },
  {
    key: 'tl.analytics.practice.read',
    description: 'See the practice’s dashboard: bookings and outcomes, leads and what they cost, reviews, profile and page views — computed from its records, no person identified.',
    divisionId: 'TL-DIV-31-ANALYTICS',
    scope: 'organization',
    sensitivity: 'internal',
  },
  {
    key: 'tl.analytics.platform.read',
    description: 'Toothlogy operators: see platform-wide totals — accounts, verification, bookings, leads and revenue, community and support — no person identified.',
    divisionId: 'TL-DIV-31-ANALYTICS',
    scope: 'global',
    sensitivity: 'confidential',
  },
  {
    key: 'tl.careers.posting.manage',
    description: 'Post, edit, publish (verified organizations only), close and mark filled the organization’s jobs and internships.',
    divisionId: 'TL-DIV-08-CAREERS',
    scope: 'organization',
    sensitivity: 'internal',
  },
  {
    key: 'tl.careers.application.read',
    description: 'See applications to the organization’s postings, with the contact details and résumés applicants agreed to share — while each application stands.',
    divisionId: 'TL-DIV-08-CAREERS',
    scope: 'organization',
    sensitivity: 'confidential',
  },
  {
    key: 'tl.careers.application.manage',
    description: 'Move applications through shortlist, interview, offer, hired or not taken forward, telling the applicant; keep internal notes.',
    divisionId: 'TL-DIV-08-CAREERS',
    scope: 'organization',
    sensitivity: 'confidential',
  },
  {
    key: 'tl.knowledge.article.write',
    description: 'Write knowledge articles and blog posts — for dentists whose credentials Toothlogy has verified; nothing is published without another person’s clinical review.',
    divisionId: 'TL-DIV-13-KNOWLEDGE',
    scope: 'global',
    sensitivity: 'internal',
  },
  {
    key: 'tl.knowledge.article.review',
    description: 'Review knowledge articles for clinical accuracy and sourcing: publish, request changes, archive. Never one’s own.',
    divisionId: 'TL-DIV-13-KNOWLEDGE',
    scope: 'global',
    sensitivity: 'internal',
  },
  {
    key: 'tl.support.ticket.work',
    description: 'Toothlogy support staff: see every support ticket, reply, keep internal notes, assign, resolve and close.',
    divisionId: 'TL-DIV-30-SUPPORT',
    scope: 'global',
    sensitivity: 'confidential',
  },
  {
    key: 'tl.reviews.review.respond',
    description: 'A practice’s administrators: reply in public to reviews of their practice, and flag a review for a moderator.',
    divisionId: 'TL-DIV-26-REVIEWS',
    scope: 'organization',
    sensitivity: 'internal',
  },
  {
    key: 'tl.reviews.review.moderate',
    description: 'Moderate reviews: see flagged and hidden reviews, hide one with the reason its author is told, restore it, or keep it.',
    divisionId: 'TL-DIV-26-REVIEWS',
    scope: 'global',
    sensitivity: 'internal',
  },
  {
    key: 'tl.community.post.moderate',
    description: 'Moderate the dental community: see reports, hide posts with a reason the author sees, restore them.',
    divisionId: 'TL-DIV-15-MEDIA',
    scope: 'global',
    sensitivity: 'internal',
  },
  {
    key: 'tl.education.faculty.confirm',
    description: 'A college’s administrators: confirm or decline faculty members’ posts at the college, or end them.',
    divisionId: 'TL-DIV-06-COLLEGES',
    scope: 'organization',
    sensitivity: 'internal',
  },
  {
    key: 'tl.marketplace.catalogue.manage',
    description: 'A dental business’s administrators: its trading profile, service districts and product and service catalogue.',
    divisionId: 'TL-DIV-19-SUPPLIERS',
    scope: 'organization',
    sensitivity: 'internal',
  },
  {
    key: 'tl.marketplace.quote.read',
    description: 'See a business’s quote requests, including the buyers’ contact details.',
    divisionId: 'TL-DIV-16-MARKETPLACE',
    scope: 'organization',
    sensitivity: 'confidential',
  },
  {
    key: 'tl.marketplace.quote.manage',
    description: 'Answer a business’s quote requests: quote a price and validity, decline, close once fulfilled.',
    divisionId: 'TL-DIV-16-MARKETPLACE',
    scope: 'organization',
    sensitivity: 'confidential',
  },
  {
    key: 'tl.marketplace.order.read',
    description: 'See a business’s orders, including buyers’ delivery details, payments recorded, tax documents and returns.',
    divisionId: 'TL-DIV-16-MARKETPLACE',
    scope: 'organization',
    sensitivity: 'confidential',
  },
  {
    key: 'tl.marketplace.order.manage',
    description: 'Run a business’s orders: confirm, decline, dispatch, record payments received and refunds, issue tax invoices, handle returns.',
    divisionId: 'TL-DIV-16-MARKETPLACE',
    scope: 'organization',
    sensitivity: 'confidential',
  },
  {
    key: 'tl.prime.membership.manage',
    description: 'An organization’s Prime membership: buy a period from the lead wallet, turn renewal on or off.',
    divisionId: 'TL-DIV-21-PRIME',
    scope: 'organization',
    sensitivity: 'internal',
  },
  {
    key: 'tl.prime.plan.manage',
    description: 'Toothlogy staff: create Prime plans (price, period, benefits), put them on sale, retire them.',
    divisionId: 'TL-DIV-21-PRIME',
    scope: 'global',
    sensitivity: 'internal',
  },
  {
    key: 'tl.admin.fx_rate.manage',
    description: 'Toothlogy staff: record exchange rates with their source and date, used only for labelled approximate totals in platform reports.',
    divisionId: 'TL-DIV-29-LOCATION',
    scope: 'global',
    sensitivity: 'internal',
  },
  {
    key: 'tl.admin.enterprise.manage',
    description: 'Toothlogy staff: record and end enterprise agreements (term, support service levels, data residency, single sign-on) and put organizations into or out of a group.',
    divisionId: 'TL-DIV-32-ADMIN',
    scope: 'global',
    sensitivity: 'internal',
  },
  {
    key: 'tl.enterprise.agreement.read',
    description: 'See the group’s enterprise agreement, its member organizations, service-level results, data-residency and sign-on status.',
    divisionId: 'TL-DIV-32-ADMIN',
    scope: 'organization',
    sensitivity: 'internal',
  },
  {
    key: 'tl.equipment.asset.read',
    description: 'See a practice’s equipment register, warranties, maintenance contracts and service visits.',
    divisionId: 'TL-DIV-18-EQUIPMENT',
    scope: 'organization',
    sensitivity: 'internal',
  },
  {
    key: 'tl.equipment.asset.manage',
    description: 'Keep a practice’s equipment register, accept or decline maintenance contracts, and request service visits.',
    divisionId: 'TL-DIV-18-EQUIPMENT',
    scope: 'organization',
    sensitivity: 'internal',
  },
  {
    key: 'tl.equipment.contract.manage',
    description: 'A service business proposes maintenance contracts to practices it has traded with, and schedules and completes their service visits.',
    divisionId: 'TL-DIV-18-EQUIPMENT',
    scope: 'organization',
    sensitivity: 'internal',
  },
  {
    key: 'tl.camps.camp.organize',
    description: 'Organize district dental camps: create, submit for approval, decide doctors’ applications, record walk-in patients and visits, complete or cancel.',
    divisionId: 'TL-DIV-04-DENTISTS',
    scope: 'global',
    sensitivity: 'internal',
  },
  {
    key: 'tl.camps.camp.approve',
    description: 'Toothlogy staff: approve or reject submitted camps (never one’s own) and see every camp’s patients.',
    divisionId: 'TL-DIV-04-DENTISTS',
    scope: 'global',
    sensitivity: 'confidential',
  },
  {
    key: 'tl.education.course.manage',
    description: 'A dental college’s administrators: its academic profile, courses and admission windows.',
    divisionId: 'TL-DIV-06-COLLEGES',
    scope: 'organization',
    sensitivity: 'internal',
  },
  {
    key: 'tl.education.enquiry.read',
    description: 'See a college’s admission enquiries, including the students’ contact details they agreed to share.',
    divisionId: 'TL-DIV-06-COLLEGES',
    scope: 'organization',
    sensitivity: 'confidential',
  },
  {
    key: 'tl.education.enquiry.manage',
    description: 'Work a college’s admission enquiries: contacted, applied, admitted or not, closed; assign, notes, follow-ups.',
    divisionId: 'TL-DIV-06-COLLEGES',
    scope: 'organization',
    sensitivity: 'confidential',
  },
  {
    key: 'tl.education.enrolment.manage',
    description: 'Keep a college’s roll: enrol admitted students (academic year, roll number), mark enrolments completed or withdrawn, see enrolled students’ contact details.',
    divisionId: 'TL-DIV-07-STUDENTS',
    scope: 'organization',
    sensitivity: 'confidential',
  },
  {
    key: 'tl.education.recognition.verify',
    description: 'Toothlogy staff: mark a college’s stated recognition as checked against the regulator’s list, or withdraw that.',
    divisionId: 'TL-DIV-06-COLLEGES',
    scope: 'global',
    sensitivity: 'internal',
  },
  {
    key: 'tl.ops.outreach.work',
    description: 'Toothlogy operations staff: see unassigned and own outreach tasks, log calls and notes, send activation invitations, complete tasks; read the district command centre.',
    divisionId: 'TL-DIV-30-SUPPORT',
    scope: 'global',
    sensitivity: 'confidential',
  },
  {
    key: 'tl.ops.outreach.manage',
    description: 'Toothlogy operations leads: create outreach for a district in bulk, assign and reassign tasks, cancel them, and see every agent’s work.',
    divisionId: 'TL-DIV-30-SUPPORT',
    scope: 'global',
    sensitivity: 'confidential',
  },
  {
    key: 'tl.data.geography.manage',
    description: 'Toothlogy staff: import and correct the district list (Country → State/UT → District).',
    divisionId: 'TL-DIV-29-LOCATION',
    scope: 'global',
    sensitivity: 'internal',
  },
  {
    key: 'tl.advertising.campaign.manage',
    description: 'Create, fund, run and read an organization’s Prime (sponsored) campaigns, paid from its wallet.',
    divisionId: 'TL-DIV-22-ADVERTISING',
    scope: 'organization',
    sensitivity: 'confidential',
  },
  {
    key: 'tl.advertising.campaign.administer',
    description: 'Toothlogy staff: see and manage every organization’s sponsored campaigns, with the same validation and audit.',
    divisionId: 'TL-DIV-22-ADVERTISING',
    scope: 'global',
    sensitivity: 'confidential',
  },
  {
    key: 'tl.billing.ledger.adjust',
    description:
      'Record money received outside the platform (with a reference) and reverse mistaken entries. Staff only; every use is audited.',
    divisionId: 'TL-DIV-23-PAYMENTS',
    scope: 'global',
    sensitivity: 'confidential',
  },
  {
    key: 'tl.billing.dispute.resolve',
    description: 'Decide lead-charge disputes. Upholding one refunds the charge. Never the person who raised it.',
    divisionId: 'TL-DIV-23-PAYMENTS',
    scope: 'global',
    sensitivity: 'confidential',
  },
] as const;

export const PERMISSION_KEYS = PERMISSIONS.map((p) => p.key);

export const PERMISSION_BY_KEY: ReadonlyMap<string, Permission> = new Map(
  PERMISSIONS.map((p) => [p.key, p]),
);

export function isKnownPermission(key: string): boolean {
  return PERMISSION_BY_KEY.has(key);
}

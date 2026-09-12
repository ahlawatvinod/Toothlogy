/**
 * TOOTHLOGY PAGE & COMPONENT REGISTRY
 *
 * PAGES are addressable user surfaces. COMPONENTS are the design-system building
 * blocks pages are made of.
 *
 * Two fields on a page carry more weight than they look:
 *
 * - **`indexable`** drives robots and sitemap generation. Toothlogy's DISCOVER
 *   pillar depends on dentist and clinic pages being indexed, and its TRUST
 *   obligation depends on patient and clinical surfaces never being indexed.
 *   Making this an explicit per-page field means neither happens by accident.
 * - **`certificationId`** links the page to its certification record
 *   (Constitution §7). `null` means uncertified — which is the honest state for
 *   every page in Phase 0, since the certification standard only becomes binding
 *   from Prompt 3.
 *
 * Only pages that actually exist as routes are registered.
 */

import type { ComponentEntry, Page } from './types';

export const PAGES: readonly Page[] = [
  {
    id: 'TL-PAGE-HOME-001',
    name: 'Home',
    description:
      'The public entry point. In Phase 0 it presents the platform foundation and its honest build status; it becomes the patient-facing landing experience in Phase 2.',
    status: 'implemented',
    phase: 2,
    route: '/',
    moduleId: 'TL-EXPERIENCE-SHELL-001',
    audience: 'anonymous',
    permissions: [],
    indexable: true,
    certificationId: 'TL-FE-HOME-001',
  },
  {
    id: 'TL-PAGE-DESIGNSYSTEM-001',
    name: 'Design System Reference',
    description:
      'Living reference for design tokens and component primitives in every theme and both text directions. Internal tooling: never indexed, and gated by the design-system-reference feature flag.',
    status: 'implemented',
    phase: 2,
    route: '/design-system',
    moduleId: 'TL-EXPERIENCE-DESIGNSYSTEM-001',
    audience: 'anonymous',
    permissions: [],
    indexable: false,
    certificationId: 'TL-FE-DESIGNSYSTEM-001',
  },

  // --- Authentication (Phase 1–2) -----------------------------------------
  page('TL-PAGE-REGISTER-001', 'Create account', '/register', 'TL-CORE-AUTH-001', 'anonymous', 1, 'Registration with self-assignable account types, honest verification delivery status.', [], true),
  page('TL-PAGE-LOGIN-001', 'Sign in', '/login', 'TL-CORE-AUTH-001', 'anonymous', 1, 'Password sign-in with the two-step verification step and restoration of an account pending deletion.'),
  page('TL-PAGE-FORGOT-001', 'Forgot password', '/forgot-password', 'TL-CORE-AUTH-001', 'anonymous', 1, 'Requests a reset link; responds identically whether or not the account exists.'),
  page('TL-PAGE-RESET-001', 'Reset password', '/reset-password', 'TL-CORE-AUTH-001', 'anonymous', 1, 'Sets a new password from a single-use link and signs out every session.'),
  page('TL-PAGE-VERIFY-001', 'Verify email', '/verify', 'TL-CORE-AUTH-001', 'anonymous', 1, 'Redeems an email verification or email-change link.'),
  page('TL-PAGE-INVITE-ACCEPT-001', 'Accept invitation', '/invitations/accept', 'TL-CORE-RBAC-001', 'authenticated', 1, 'Joins an organization from an invitation addressed to the signed-in account’s email.'),

  // --- Account centre (Phase 2) --------------------------------------------
  page('TL-PAGE-ACCOUNT-001', 'Account overview', '/account', 'TL-USERS-PREFERENCES-001', 'authenticated', 2, 'Signed-in home: notifications, organizations, role-specific entry points.', ['tl.core.user.read.self']),
  page('TL-PAGE-ACCOUNT-PROFILE-001', 'Profile', '/account/profile', 'TL-USERS-PREFERENCES-001', 'authenticated', 2, 'Name, photo, email change and verification, phone verification by code.', ['tl.core.user.read.self']),
  page('TL-PAGE-ACCOUNT-PREFS-001', 'Preferences', '/account/preferences', 'TL-USERS-PREFERENCES-001', 'authenticated', 2, 'Region and language, appearance and accessibility, quiet hours, search defaults, saved places.', ['tl.core.user.read.self']),
  page('TL-PAGE-ACCOUNT-NOTIFICATIONS-001', 'Notifications', '/account/notifications', 'TL-CORE-NOTIFICATIONS-001', 'authenticated', 2, 'Notification centre with read state, paging, and the category × channel preference matrix.', ['tl.core.user.read.self']),
  page('TL-PAGE-SECURITY-001', 'Security', '/account/security', 'TL-CORE-AUTH-001', 'authenticated', 2, 'Security activity, sessions, password and two-step verification with recovery codes.', ['tl.core.user.read.self']),
  page('TL-PAGE-ACCOUNT-PRIVACY-001', 'Privacy and data', '/account/privacy', 'TL-USERS-PREFERENCES-001', 'authenticated', 2, 'Consents, personal data download and account deletion with a grace period.', ['tl.core.user.read.self']),
  page('TL-PAGE-ACCOUNT-ORGS-001', 'Organizations', '/account/organizations', 'TL-CORE-RBAC-001', 'authenticated', 2, 'Organizations the user belongs to, with verification state.', ['tl.core.user.read.self']),
  page('TL-PAGE-ORG-NEW-001', 'Create organization', '/account/organizations/new', 'TL-CORE-RBAC-001', 'authenticated', 1, 'Creates a clinic, hospital, college, supplier or employer organization.', ['tl.core.user.read.self']),
  page('TL-PAGE-ORG-DETAIL-001', 'Organization', '/account/organizations/:id', 'TL-CORE-RBAC-001', 'authenticated', 1, 'One organization: verification status and submission, members and roles, invitations, practice claims, services and prices, and branch facilities, access, temporary closure and holidays.', ['tl.core.organization.read']),
  page('TL-PAGE-ORG-CLAIM-001', 'Claim a clinic listing', '/account/claim/:id', 'TL-DENTIST-VERIFICATION-001', 'authenticated', 3, 'Claim an unowned clinic listing with one’s role and documents uploaded as oneself; creates an ORGANIZATION_CLAIM verification request. Says so instead when the listing is managed or a claim is awaiting review.'),
  page('TL-PAGE-DENTIST-ANALYTICS-001', 'Your numbers (dentist)', '/account/dentist-profile/analytics', 'TL-ANALYTICS-001', 'authenticated', 10, 'The dentist’s own bookings and outcomes, reviews, profile views and most-booked services across their practices over 7, 30 or 90 days; no lead charges (those are the practice’s).', ['tl.dentist.profile.manage.self']),
  page('TL-PAGE-DENTIST-PROFILE-EDIT-001', 'Dentist profile editor', '/account/dentist-profile', 'TL-DENTIST-PROFILE-001', 'authenticated', 3, 'Professional profile, qualifications, practices and the verification status that governs discoverability.', ['tl.dentist.profile.manage.self']),

  // --- Staff ---------------------------------------------------------------
  // --- Phase 4: discovery, booking, leads, billing, Prime ---------------------
  page('TL-PAGE-BOOK-001', 'Book an appointment', '/book/:slug', 'TL-APPOINTMENT-BOOKING-001', 'anonymous', 4, 'Branch → service → type → date → time → who → confirm, from real availability; one idempotency key per intent; the server’s real status shown; waitlist and callback when nothing is free.', [], false, 'implemented'),
  page('TL-PAGE-APPOINTMENTS-001', 'Appointments', '/account/appointments', 'TL-APPOINTMENT-BOOKING-001', 'authenticated', 4, 'The patient’s upcoming, past and cancelled appointments, and waitlist entries.', ['tl.appointment.book.self'], false, 'implemented'),
  page('TL-PAGE-APPOINTMENT-DETAIL-001', 'Appointment', '/account/appointments/:id', 'TL-APPOINTMENT-BOOKING-001', 'authenticated', 4, 'One appointment for its patient: cancel, change time, check in, confirm a proposal or held slot, book again; history.', ['tl.appointment.book.self'], false, 'implemented'),
  page('TL-PAGE-PRACTICE-001', 'Practice', '/account/practice', 'TL-APPOINTMENT-BOOKING-001', 'authenticated', 4, 'Requests to answer, today, the next seven days and recent activity, with every lifecycle action.', [], false, 'implemented'),
  page('TL-PAGE-PRACTICE-APPOINTMENT-001', 'Practice appointment', '/account/practice/appointments/:id', 'TL-APPOINTMENT-BOOKING-001', 'authenticated', 4, 'One appointment from the practice side, with the patient’s contact details and history.', [], false, 'implemented'),
  page('TL-PAGE-ORG-CAMPAIGNS-001', 'Prime campaigns', '/account/organizations/:id/campaigns', 'TL-SPONSORED-PLACEMENT-001', 'authenticated', 4, 'Prime options (dentist, clinic, hospital), the organization’s campaigns and a create form with a live Sponsored preview and the budget minimum; drafts only — nothing is held or shown until activation.', ['tl.advertising.campaign.manage'], false, 'implemented'),
  page('TL-PAGE-ORG-CAMPAIGN-001', 'Prime campaign', '/account/organizations/:id/campaigns/:campaignId', 'TL-SPONSORED-PLACEMENT-001', 'authenticated', 4, 'One campaign: activate, pause, resume, cancel, add budget, change targeting; budget, held, spent, refunded, remaining and daily rate; sponsored analytics beside organic leads; days charged; audit trail.', ['tl.advertising.campaign.manage'], false, 'implemented'),
  page('TL-PAGE-MY-MESSAGES-001', 'Messages', '/account/messages', 'TL-MESSAGING-001', 'authenticated', 5, 'The patient’s conversations with practices, and a new message to a practice they have an appointment with.', [], false, 'implemented'),
  page('TL-PAGE-MY-THREAD-001', 'Conversation', '/account/messages/:id', 'TL-MESSAGING-001', 'authenticated', 5, 'One conversation for its patient: messages, reply, close.', [], false, 'implemented'),
  page('TL-PAGE-PRACTICE-MESSAGES-001', 'Practice messages', '/account/practice/messages', 'TL-MESSAGING-001', 'authenticated', 5, 'Patients’ conversations for each practice one may read messages for.', ['tl.messaging.thread.read'], false, 'implemented'),
  page('TL-PAGE-PRACTICE-THREAD-001', 'Practice conversation', '/account/practice/messages/:id', 'TL-MESSAGING-001', 'authenticated', 5, 'One conversation from the practice side: reply and close, or read only.', ['tl.messaging.thread.read'], false, 'implemented'),
  page('TL-PAGE-TICKET-001', 'Support request', '/help/tickets/:id', 'TL-SUPPORT-001', 'authenticated', 5, 'One support request: conversation, reply; staff internal notes, status, assignment; requester closes.', [], false, 'implemented'),
  page('TL-PAGE-ADMIN-SUPPORT-001', 'Support (staff)', '/admin/support', 'TL-SUPPORT-001', 'staff', 5, 'Open and waiting requests, mine, resolved, closed.', ['tl.support.ticket.work'], false, 'implemented'),
  page('TL-PAGE-MY-RECORD-001', 'Dental record', '/account/records', 'TL-PATIENT-RECORD-001', 'authenticated', 6, 'The patient’s record (theirs and every practice’s entries, prescriptions), who may see it, requests to allow or decline, and who looked.', [], false, 'implemented'),
  page('TL-PAGE-PRESCRIPTION-001', 'Prescription', '/prescriptions/:id', 'TL-PRESCRIPTION-001', 'authenticated', 6, 'A prescription to print or save as PDF, with the QR code a pharmacist checks; the issuing practice may cancel it.', [], false, 'implemented'),
  page('TL-PAGE-RX-VERIFY-001', 'Prescription check', '/rx/:code', 'TL-PRESCRIPTION-001', 'anonymous', 6, 'The public check behind a prescription’s QR code. Not indexed.', [], false, 'implemented'),
  page('TL-PAGE-ORG-PATIENTS-001', 'Patients’ records', '/account/organizations/:id/patients', 'TL-PATIENT-RECORD-001', 'authenticated', 6, 'Patients who shared their record with the practice, requests waiting, and recent patients to ask.', ['tl.records.record.read'], false, 'implemented'),
  page('TL-PAGE-ORG-PATIENT-RECORD-001', 'Patient record', '/account/organizations/:id/patients/:userId', 'TL-PATIENT-RECORD-001', 'authenticated', 6, 'A patient’s record under their grant (an audited view): add entries and files, retract the practice’s own, issue prescriptions.', ['tl.records.record.read'], false, 'implemented'),
  page('TL-PAGE-MY-REVIEWS-001', 'My reviews', '/account/reviews', 'TL-REVIEWS-001', 'authenticated', 5, 'The patient’s reviews with replies; change for 30 days, remove.', [], false, 'implemented'),
  page('TL-PAGE-PRACTICE-REVIEWS-001', 'Practice reviews', '/account/practice/reviews', 'TL-REVIEWS-001', 'authenticated', 5, 'Reviews of the practices one answers for and of oneself as a dentist; reply once (editable), flag for a moderator.', [], false, 'implemented'),
  page('TL-PAGE-ADMIN-REVIEWS-001', 'Reviews (staff)', '/admin/reviews', 'TL-REVIEWS-001', 'staff', 5, 'Flagged and hidden reviews: keep, hide with a reason, restore.', ['tl.reviews.review.moderate'], false, 'implemented'),
  page('TL-PAGE-COMMUNITY-001', 'Dental community', '/community', 'TL-COMMUNITY-001', 'anonymous', 7, 'Questions by topic, unanswered and search, with a not-medical-advice notice; not indexed.', [], false, 'implemented'),
  page('TL-PAGE-COMMUNITY-ASK-001', 'Ask the community', '/community/ask', 'TL-COMMUNITY-001', 'authenticated', 7, 'The question form for signed-in members with a verified email.', [], false, 'implemented'),
  page('TL-PAGE-COMMUNITY-QUESTION-001', 'Community question', '/community/:id', 'TL-COMMUNITY-001', 'anonymous', 7, 'A question with answers (accepted, then verified dentists), answer form, accept, report, remove, moderation; hidden posts only for their author and moderators.', [], false, 'implemented'),
  page('TL-PAGE-ADMIN-COMMUNITY-001', 'Community (staff)', '/admin/community', 'TL-COMMUNITY-001', 'staff', 7, 'Open reports and hidden posts; hide with a reason or restore.', ['tl.community.post.moderate'], false, 'implemented'),
  page('TL-PAGE-ACADEMICS-001', 'Researchers and faculty', '/academics', 'TL-ACADEMIC-001', 'anonymous', 7, 'Public researcher and faculty profiles by type and interest, with confirmed college posts.', [], true, 'implemented'),
  page('TL-PAGE-RESEARCHER-001', 'Researcher', '/researchers/:slug', 'TL-ACADEMIC-001', 'anonymous', 7, 'A researcher’s public profile and publications, labelled as stated.', [], true, 'implemented'),
  page('TL-PAGE-FACULTY-001', 'Faculty member', '/faculty/:slug', 'TL-ACADEMIC-001', 'anonymous', 7, 'A faculty member’s public profile; college posts shown only when the college confirmed them.', [], true, 'implemented'),
  page('TL-PAGE-MY-ACADEMIC-001', 'Academic profile', '/account/academic', 'TL-ACADEMIC-001', 'authenticated', 7, 'The person’s researcher and faculty profiles, publications and college posts.', [], false, 'implemented'),
  page('TL-PAGE-ORG-FACULTY-001', 'Faculty', '/account/organizations/:id/faculty', 'TL-ACADEMIC-001', 'authenticated', 8, 'A college’s faculty requests and posts to confirm, decline or end.', ['tl.education.faculty.confirm'], false, 'implemented'),
  page('TL-PAGE-MARKETPLACE-001', 'Dental marketplace', '/marketplace', 'TL-MARKETPLACE-PRODUCT-001', 'anonymous', 9, 'Published products and lab services of businesses that manage their listing, by category, district served and name or brand; indicative GST-inclusive prices; quotes on request, no checkout.', [], true, 'implemented'),
  page('TL-PAGE-SUPPLIER-001', 'Dental business', '/suppliers/:slug', 'TL-MARKETPLACE-PRODUCT-001', 'anonymous', 9, 'A business’s profile (stated unless verified), districts served, published catalogue and the quote request form for verified buyers.', [], false, 'implemented'),
  page('TL-PAGE-MY-QUOTES-001', 'My quotes', '/account/quotes', 'TL-MARKETPLACE-PRODUCT-001', 'authenticated', 9, 'The buyer’s quote requests with quotes, validity, accept and withdraw; the seller’s contact once accepted.', [], false, 'implemented'),
  page('TL-PAGE-ORG-BUSINESS-001', 'Catalogue', '/account/organizations/:id/business', 'TL-MARKETPLACE-PRODUCT-001', 'authenticated', 9, 'A business’s trading profile, service districts and catalogue (add, edit, publish, archive).', ['tl.marketplace.catalogue.manage'], false, 'implemented'),
  page('TL-PAGE-ORG-QUOTES-001', 'Quote requests', '/account/organizations/:id/quotes', 'TL-MARKETPLACE-PRODUCT-001', 'authenticated', 9, 'A business’s quote requests with numbers, buyer details and quote / decline / close.', ['tl.marketplace.quote.read'], false, 'implemented'),
  page('TL-PAGE-CART-001', 'Cart', '/cart', 'TL-MARKETPLACE-ORDER-001', 'authenticated', 9, 'The buyer’s cart by seller, at current prices, with anything to fix, and checkout per seller.', [], false, 'implemented'),
  page('TL-PAGE-MY-ORDERS-001', 'My orders', '/account/orders', 'TL-MARKETPLACE-ORDER-001', 'authenticated', 9, 'The buyer’s orders with status and payment.', [], false, 'implemented'),
  page('TL-PAGE-ORDER-001', 'Order', '/orders/:id', 'TL-MARKETPLACE-ORDER-001', 'authenticated', 9, 'One order for its buyer or the seller’s people: lines, history, payments recorded, tax documents, returns, and what each side may do next.', [], false, 'implemented'),
  page('TL-PAGE-ORG-ORDERS-001', 'Orders', '/account/organizations/:id/orders', 'TL-MARKETPLACE-ORDER-001', 'authenticated', 9, 'A business’s orders by status.', ['tl.marketplace.order.read'], false, 'implemented'),
  page('TL-PAGE-ORG-EQUIPMENT-001', 'Equipment', '/account/organizations/:id/equipment', 'TL-EQUIPMENT-SERVICE-001', 'authenticated', 9, 'A practice’s equipment register with warranties, its maintenance contracts (accept, decline, cancel) and service visits (request, cancel).', ['tl.equipment.asset.read'], false, 'implemented'),
  page('TL-PAGE-ORG-SERVICE-CONTRACTS-001', 'Service contracts', '/account/organizations/:id/service-contracts', 'TL-EQUIPMENT-SERVICE-001', 'authenticated', 9, 'A service business’s maintenance contracts: propose to practices it has traded with, schedule and complete visits, cancel.', ['tl.equipment.contract.manage'], false, 'implemented'),
  page('TL-PAGE-ORG-PRIME-001', 'Prime membership', '/account/organizations/:id/prime', 'TL-PRIME-MEMBERSHIP-001', 'authenticated', 10, 'An organization’s Prime period and benefits in use, renewal on or off, plans on sale with price and tax, past periods.', ['tl.prime.membership.manage'], false, 'implemented'),
  page('TL-PAGE-ADMIN-PRIME-001', 'Prime plans (staff)', '/admin/prime', 'TL-PRIME-MEMBERSHIP-001', 'staff', 10, 'Create Prime plans (price, period, benefits), put them on sale, retire them; current members per plan.', ['tl.prime.plan.manage'], false, 'implemented'),
  page('TL-PAGE-WHICH-DENTIST-001', 'Which dentist should I see?', '/which-dentist', 'TL-TRIAGE-001', 'anonymous', 11, 'Safety questions and concerns → how soon, which kind of dentist, treatment pages and a search. Fixed rules, not AI, not a diagnosis; answers stay in the browser.', [], true, 'implemented'),
  page('TL-PAGE-ADMIN-FX-001', 'Exchange rates (staff)', '/admin/exchange-rates', 'TL-GLOBAL-EXPANSION-001', 'staff', 12, 'Record exchange rates with source and date; used only for labelled approximate totals in platform reports.', ['tl.admin.fx_rate.manage'], false, 'implemented'),
  page('TL-PAGE-ADMIN-ENTERPRISE-001', 'Enterprise (staff)', '/admin/enterprise', 'TL-ENTERPRISE-001', 'staff', 12, 'Enterprise agreements with service-level results, residency and sign-on status; record and end agreements; put organizations into or out of a group.', ['tl.admin.enterprise.manage'], false, 'implemented'),
  page('TL-PAGE-ORG-ENTERPRISE-001', 'Enterprise agreement', '/account/organizations/:id/enterprise', 'TL-ENTERPRISE-001', 'authenticated', 12, 'The group’s agreement, member organizations, support service-level results, data-residency and sign-on status.', ['tl.enterprise.agreement.read'], false, 'implemented'),
  page('TL-PAGE-TAX-DOCUMENT-001', 'Tax document', '/tax-documents/:id', 'TL-MARKETPLACE-ORDER-001', 'authenticated', 9, 'A printable tax invoice or credit note, laid out by the seller’s country tax pack.', [], false, 'implemented'),
  page('TL-PAGE-CAMPS-001', 'Dental camps', '/camps', 'TL-CAMPS-001', 'anonymous', 5, 'Upcoming staff-approved dental camps by state: date, venue, district, confirmed doctors, places left.', [], true, 'implemented'),
  page('TL-PAGE-CAMP-001', 'Dental camp', '/camps/:slug', 'TL-CAMPS-001', 'anonymous', 5, 'An approved or held camp: time, venue, organizer, offered services, confirmed verified dentists, places; registration for signed-in patients, application for verified dentists.', [], true, 'implemented'),
  page('TL-PAGE-MY-CAMPS-001', 'My camps', '/account/camps', 'TL-CAMPS-001', 'authenticated', 5, 'Participation history: camps organized, served at (application, decision, attendance) and attended (findings, referral, ask the dentist to call, book).', [], false, 'implemented'),
  page('TL-PAGE-CAMP-NEW-001', 'Organize a camp', '/account/camps/new', 'TL-CAMPS-001', 'authenticated', 5, 'Plan a camp as a draft: title, district, venue, India-time dates, places, services, optionally for a managed organization.', ['tl.camps.camp.organize'], false, 'implemented'),
  page('TL-PAGE-CAMP-CONSOLE-001', 'Camp console', '/account/camps/:id', 'TL-CAMPS-001', 'authenticated', 5, 'For the organizer, staff and confirmed doctors: status actions, numbers (incl. attributed leads and appointments), doctors’ applications and attendance, patients with visits and walk-ins.', [], false, 'implemented'),
  page('TL-PAGE-ADMIN-CAMPS-001', 'Camps (staff)', '/admin/camps', 'TL-CAMPS-001', 'staff', 5, 'Submitted camps to approve or reject with a reason (never one’s own), with approved and rejected ones.', ['tl.camps.camp.approve'], false, 'implemented'),
  page('TL-PAGE-COLLEGES-001', 'Dental colleges', '/colleges', 'TL-EDUCATION-001', 'anonymous', 8, 'Claimed dental colleges with published courses, by level (BDS, MDS…) and state; ownership, affiliation and recognition labelled as stated or checked.', [], true, 'implemented'),
  page('TL-PAGE-COLLEGE-001', 'Dental college', '/colleges/:slug', 'TL-EDUCATION-001', 'anonymous', 8, 'A college’s profile, recognition (stated or checked), published courses with fee, seats, entrance exam and admission window, and the enquiry form for signed-in students with a verified email.', [], false, 'implemented'),
  page('TL-PAGE-MY-ADMISSIONS-001', 'My admissions', '/account/admissions', 'TL-EDUCATION-001', 'authenticated', 8, 'The student’s enquiries by college and course, with status and withdraw.', [], false, 'implemented'),
  page('TL-PAGE-ORG-EDUCATION-001', 'Courses', '/account/organizations/:id/education', 'TL-EDUCATION-001', 'authenticated', 8, 'A college’s academic profile, courses (add, edit, publish, archive) and admission windows.', ['tl.education.course.manage'], false, 'implemented'),
  page('TL-PAGE-ORG-ADMISSIONS-001', 'Admissions', '/account/organizations/:id/admissions', 'TL-EDUCATION-001', 'authenticated', 8, 'A college’s admission enquiries: numbers by status and course, each enquiry with the student’s details, history and actions.', ['tl.education.enquiry.read'], false, 'implemented'),
  page('TL-PAGE-ADMIN-COLLEGES-001', 'Colleges (staff)', '/admin/colleges', 'TL-EDUCATION-001', 'staff', 8, 'Colleges’ stated recognition, to check against the regulator’s list and mark checked or withdraw.', ['tl.education.recognition.verify'], false, 'implemented'),
  page('TL-PAGE-ADMIN-OPERATIONS-001', 'Operations (staff)', '/admin/operations', 'TL-OPERATIONS-001', 'staff', 5, 'District command centre: records, pre-made and activated dentists, unclaimed and claimed listings, live clinics, 30-day leads and bookings, open and overdue outreach per district; work per operator; bulk outreach for a district (leads).', ['tl.ops.outreach.work'], false, 'implemented'),
  page('TL-PAGE-ADMIN-OUTREACH-001', 'Outreach tasks (staff)', '/admin/operations/tasks', 'TL-OPERATIONS-001', 'staff', 5, 'Mine / unassigned / everyone’s outreach by status, district and due date, with contact details, recent activity, take, log, close, reassign and activation invitation (disabled while email/SMS are not configured).', ['tl.ops.outreach.work'], false, 'implemented'),
  page('TL-PAGE-ADMIN-DATA-001', 'Directory data (staff)', '/admin/data', 'TL-INDIA-DATA-001', 'staff', 5, 'Import extracted rows (CSV) and district lists; review queue with original beside normalized data, district, confidence and duplicate links, all UNVERIFIED; create pre-made accounts or unowned listings, or reject; coverage per district.', ['tl.data.extraction.manage'], false, 'implemented'),
  page('TL-PAGE-ACTIVATE-001', 'Activate profile', '/activate', 'TL-INDIA-DATA-001', 'anonymous', 5, 'A dentist takes over a pre-made profile: email + mobile to receive a link and a code (same answer whether or not one matches), then code + password + terms.', [], false, 'implemented'),
  page('TL-PAGE-ADMIN-CAMPAIGNS-001', 'Campaigns (staff)', '/admin/campaigns', 'TL-SPONSORED-PLACEMENT-001', 'staff', 4, 'Every organization’s campaigns by status, with a route into each organization’s campaign pages under the same validation and audit.', ['tl.advertising.campaign.administer'], false, 'implemented'),
  page('TL-PAGE-PRACTICE-CALENDAR-001', 'Calendar', '/account/practice/calendar', 'TL-APPOINTMENT-BOOKING-001', 'authenticated', 4, 'Month, week and day views per practice: appointments with status, patient and service; sessions and clinic hours; leave, blocks, holidays and closures; each appointment opens its detail. Works without JavaScript; a list of days on a phone.', [], false, 'implemented'),
  page('TL-PAGE-PRACTICE-AVAILABILITY-001', 'Availability', '/account/practice/availability', 'TL-AVAILABILITY-ENGINE-001', 'authenticated', 4, 'Weekly sessions (split shifts), leave and blocked time per practice, entered in the branch’s timezone.', [], false, 'implemented'),
  page('TL-PAGE-PRACTICE-LEADS-001', 'Leads', '/account/practice/leads', 'TL-LEADS-ENGINE-001', 'authenticated', 4, 'Lead statistics and leads per organization with billing state, guarded actions and disputes; callback contact hidden until paid.', ['tl.leads.lead.read'], false, 'implemented'),
  page('TL-PAGE-ORG-BILLING-001', 'Lead wallet', '/account/organizations/:id/billing', 'TL-BILLING-WALLET-001', 'authenticated', 4, 'Balance, qualified-lead price with GST, ledger, monthly statements and disputes; no top-up button while no payment provider is connected.', ['tl.billing.wallet.read'], false, 'implemented'),
  page('TL-PAGE-ADMIN-BILLING-001', 'Billing (staff)', '/admin/billing', 'TL-BILLING-WALLET-001', 'staff', 4, 'Record referenced transfers, reverse mistaken entries and decide disputes; audited.', ['tl.billing.ledger.adjust'], false, 'implemented'),
  page('TL-PAGE-ADMIN-VERIFY-001', 'Verification queue', '/admin/verification', 'TL-DENTIST-VERIFICATION-001', 'staff', 3, 'Reviewer queue for dentist credentials, oldest first; a reviewer cannot decide their own application.', ['tl.verification.request.review']),

  // --- Public site -----------------------------------------------------------
  page('TL-PAGE-DENTISTPUBLIC-001', 'Public dentist profile', '/dentists/:slug', 'TL-DENTIST-PROFILE-001', 'anonymous', 3, 'Verified dentists only, with verified qualifications only, and Dentist structured data.', [], true),
  page('TL-PAGE-CLINICPUBLIC-001', 'Public clinic page', '/clinics/:slug', 'TL-CLINIC-CATALOGUE-001', 'anonymous', 3, 'Branches, hours, holidays, services and prices, facilities (as stated until verified) and confirmed discoverable dentists; indexable and marked up only when verified; honest “booking not live” state.', [], true),
  page('TL-PAGE-ABOUT-001', 'About', '/about', 'TL-EXPERIENCE-SHELL-001', 'anonymous', 2, 'What Toothlogy is, in the founder’s words: vision, mission, the eight objectives and the National Dental Care Movement (“100 Crore Smiles”); the commitments it runs on; and what works today. AboutPage/Organization structured data names the founder.', [], true),
  page('TL-PAGE-PRIVACY-POLICY-001', 'Privacy policy', '/privacy', 'TL-EXPERIENCE-SHELL-001', 'anonymous', 2, 'The privacy policy in 16 sections: what is collected and how it is used, dentist, clinic and service-provider information, sharing and disclosure, cookies, communications, security, retention, children’s privacy, third-party services, international processing, privacy rights, accuracy, changes, contact (info@toothlogy.com) and the healthcare disclaimer — followed by a section stating what actually applies on the platform today, including which providers are not configured.', [], true),
  page('TL-PAGE-TERMS-001', 'Master Terms and Conditions', '/terms', 'TL-EXPERIENCE-SHELL-001', 'anonymous', 2, 'The Master Terms & Conditions (version 1.0): one document governing every role, in nine parts and 85 numbered sections, each with a stable anchor for citation and for a future acceptance workflow. Introduction and definitions; eligibility and account verification (Toothlogy grants no licence or professional authorization); role sections for patients, dentists, clinics and hospitals, vendors, laboratories, dental colleges, students and interns, and volunteers; camps and community programmes, including the four ways an activity may be organized (Toothlogy’s own, with government permission, in collaboration with authorities, or with a partner institution) with no implied endorsement, supervision, prominent patient consent, health information, photography, emergencies and safety; platform use — appointments, marketplace, payments, reviews, advertising with labelled paid placement; programmes, people and property — recruitment, no unauthorised commercial activity, IP, confidentiality, data protection, minors, certificates (no academic credit or qualification implied), deployment and insurance (only where an arrangement provides it); compliance, prohibited activities, enforcement and grievance redressal; legal terms — governing law (Indian law without displacing mandatory local law), third parties, availability, healthcare disclaimer, liability split by who is responsible for what, indemnity, force majeure, changes, severability, hierarchy and contact; a role matrix; and acceptance and technology — electronic and role-based acceptance, programme-specific terms, AI (never a diagnosis), teleconsultation, digital records (the patient owns the information), consent withdrawal, access and portability, account deletion subject to lawful retention, communication consent, the emergency disclaimer, no guaranteed outcome, the dentist–patient and vendor–buyer relationships, restricted products, payment disputes and chargebacks, promotions, referral abuse, protected government and institutional branding, research and ethics approval, aggregated programme reporting, anti-bribery, conflicts of interest, whistleblower protection, accessibility, international users, language versions, notices, assignment, no waiver, survival, which policies exist today, version control and the legal hierarchy. Contact: info@toothlogy.com; no legal entity, address or grievance officer is stated because none has been provided.', [], true),
  page('TL-PAGE-TERMS-INTERNS-001', 'Terms for interns and volunteers', '/terms/interns-volunteers', 'TL-EXPERIENCE-SHELL-001', 'anonymous', 2, 'Terms for interns, volunteers, dental students and dental interns, in four parts: participation and recruitment through recognised dental colleges (institutional approval is not endorsement) and the scope a student works within; dental camps and community programmes — the four ways an activity may be organized (Toothlogy’s own, with government permission, in collaboration with authorities, or with a partner institution), government permission without implied endorsement, supervision, no unauthorised medical practice, patient consent, referral, emergencies, safety, camp conduct, no personal solicitation, deployment, identification (never a government employee or a dentist unless qualified); information, records and recognition (confidentiality, health information, social media, programme reporting, certificates that imply no qualification or appointment); and general terms, including that insurance or stipend applies only where an agreement says so, and that every activity remains subject to Indian law, professional regulations, institutional requirements, government permissions, patient consent and public-health and safety requirements.', [], true),
  page('TL-PAGE-CONTACT-001', 'Contact', '/contact', 'TL-EXPERIENCE-SHELL-001', 'anonymous', 2, 'How to reach Toothlogy.', [], true),
  page('TL-PAGE-OFFLINE-001', 'Offline', '/offline', 'TL-EXPERIENCE-PWA-001', 'anonymous', 2, 'Shown by the service worker when there is no connection; contains no personal data by construction.'),

  // --- Placeholders: honest "not built yet" pages ---------------------------
  page('TL-PAGE-FIND-001', 'Find a dentist', '/find', 'TL-DISCOVERY-INDEX-001', 'anonymous', 4, 'Dentist and clinic discovery over the index: text, place (city-centre precision labelled) or “use my location”, radius, specialty, language, treatment, appointment type, emergency and fee filters; organic results only, with the Sponsored label wired to `promoted`; works without JavaScript; not indexable.', [], false, 'implemented'),
  page('TL-PAGE-ORG-STUDENTS-001', 'Students', '/account/organizations/:id/students', 'TL-EDUCATION-001', 'authenticated', 8, 'A college’s roll by course, academic year and status, with contact details and roll numbers; mark completed or withdrawn.', ['tl.education.enrolment.manage'], false, 'implemented'),
  page('TL-PAGE-ADMIN-COUNTRIES-001', 'Countries (staff)', '/admin/countries', 'TL-GLOBAL-EXPANSION-001', 'staff', 12, 'Every modelled country with its readiness checks; open (only when ready) or close to new organizations, with a reason.', ['tl.admin.country.manage'], false, 'implemented'),
  page('TL-PAGE-ORG-DEVICES-001', 'Equipment', '/account/organizations/:id/devices', 'TL-IOT-001', 'authenticated', 11, 'The practice’s connected equipment: status, last reading, open alerts; register a device (its token shown once).', ['tl.iot.device.read'], false, 'implemented'),
  page('TL-PAGE-ORG-DEVICE-001', 'Device', '/account/organizations/:id/devices/:deviceId', 'TL-IOT-001', 'authenticated', 11, 'One device: alerts to resolve, latest and recent readings against its limits, limits editor, re-key, retire.', ['tl.iot.device.read'], false, 'implemented'),
  page('TL-PAGE-ORG-ANALYTICS-001', 'Analytics', '/account/organizations/:id/analytics', 'TL-ANALYTICS-001', 'authenticated', 10, 'The practice’s bookings and outcomes, leads and spend, reviews, views and most-booked services over 7, 30 or 90 days, with a per-day chart.', ['tl.analytics.practice.read'], false, 'implemented'),
  page('TL-PAGE-ADMIN-ANALYTICS-001', 'Platform analytics (staff)', '/admin/analytics', 'TL-ANALYTICS-001', 'staff', 10, 'Platform-wide accounts, verification, bookings, searches, shared records, lead revenue, community and support, with per-day charts.', ['tl.analytics.platform.read'], false, 'implemented'),
  page('TL-PAGE-CAREERS-001', 'Careers', '/careers', 'TL-CAREERS-001', 'anonymous', 8, 'Jobs and internships at verified dental organizations: search, filter by kind, role and district.', [], true, 'implemented'),
  page('TL-PAGE-POSTING-001', 'Job posting', '/careers/:id', 'TL-CAREERS-001', 'anonymous', 8, 'One posting with JobPosting structured data and the application form (signed in, verified email, résumé, consent).', [], true, 'implemented'),
  page('TL-PAGE-MY-APPLICATIONS-001', 'My applications', '/account/applications', 'TL-CAREERS-001', 'authenticated', 8, 'The applicant’s applications, where each stands, interview times and messages; withdraw.', [], false, 'implemented'),
  page('TL-PAGE-ORG-CAREERS-001', 'Careers', '/account/organizations/:id/careers', 'TL-CAREERS-001', 'authenticated', 8, 'The organization’s postings with applications counted; post, edit, publish, close, mark filled.', ['tl.careers.posting.manage'], false, 'implemented'),
  page('TL-PAGE-ORG-POSTING-001', 'Applications', '/account/organizations/:id/careers/:postingId', 'TL-CAREERS-001', 'authenticated', 8, 'Applications to one posting: contact details and résumés while they stand; move each on; internal notes.', ['tl.careers.application.read'], false, 'implemented'),
  page('TL-PAGE-KNOWLEDGE-001', 'Learn', '/knowledge', 'TL-KNOWLEDGE-001', 'anonymous', 7, 'The dental knowledge library: reviewed, sourced articles on conditions, treatments, procedures and care, and dentists’ blog posts; search and filter by kind.', [], true, 'implemented'),
  page('TL-PAGE-ARTICLE-001', 'Article', '/knowledge/:slug', 'TL-KNOWLEDGE-001', 'anonymous', 7, 'One reviewed article: author and reviewer, sources, “find a dentist for this treatment”, MedicalWebPage structured data.', [], true, 'implemented'),
  page('TL-PAGE-MY-ARTICLES-001', 'My articles', '/account/articles', 'TL-KNOWLEDGE-001', 'authenticated', 7, 'A verified dentist’s drafts, articles in review and published articles; start a new one.', ['tl.knowledge.article.write'], false, 'implemented'),
  page('TL-PAGE-ARTICLE-EDIT-001', 'Edit article', '/account/articles/:id', 'TL-KNOWLEDGE-001', 'authenticated', 7, 'The working copy: text, sources, cover; send for review; archive; the reviewer’s note.', [], false, 'implemented'),
  page('TL-PAGE-ADMIN-KNOWLEDGE-001', 'Articles (review)', '/admin/knowledge', 'TL-KNOWLEDGE-001', 'staff', 7, 'Articles waiting for clinical review, oldest first.', ['tl.knowledge.article.review'], false, 'implemented'),
  page('TL-PAGE-ARTICLE-REVIEW-001', 'Review article', '/admin/knowledge/:id', 'TL-KNOWLEDGE-001', 'staff', 7, 'Read the working copy with its sources; publish, request changes, or archive.', ['tl.knowledge.article.review'], false, 'implemented'),
  page('TL-PAGE-FOR-DENTISTS-001', 'For dentists', '/for-dentists', 'TL-EXPERIENCE-SHELL-001', 'anonymous', 3, 'What Toothlogy does for dentists as built today, each point linked to where it happens; lead pricing read from the configured rule.', [], true, 'implemented'),
  page('TL-PAGE-FOR-CLINICS-001', 'For clinics', '/for-clinics', 'TL-EXPERIENCE-SHELL-001', 'anonymous', 3, 'What Toothlogy does for clinics, hospitals and dental businesses as built today — claiming a listing first; lead pricing read from the configured rule.', [], true, 'implemented'),
  page('TL-PAGE-HELP-001', 'Help', '/help', 'TL-SUPPORT-001', 'anonymous', 5, 'Reach Toothlogy’s team: ask by category (signed in) and follow your requests; points treatment questions to the practice.', [], true, 'implemented'),
] as const;

/** Compact constructor so the page list stays readable. Certification IDs are assigned when certification starts. */
function page(
  id: string,
  name: string,
  route: string,
  moduleId: string,
  audience: Page['audience'],
  phase: Page['phase'],
  description: string,
  permissions: readonly string[] = [],
  indexable = false,
  status: Page['status'] = 'implemented',
): Page {
  return { id, name, route, moduleId, audience, phase, description, permissions, indexable, status, certificationId: null };
}

export const PAGE_BY_ID: ReadonlyMap<string, Page> = new Map(PAGES.map((p) => [p.id, p]));

// ---------------------------------------------------------------------------
// Components
// ---------------------------------------------------------------------------

/**
 * `ariaPattern` names the WAI-ARIA Authoring Practices pattern a component
 * implements, or `null` where no pattern applies. It is recorded so that
 * accessibility review has a stated target to test against rather than a
 * subjective impression — the ACCESSIBILITY certification dimension checks the
 * component against its declared pattern.
 */
export const COMPONENTS: readonly ComponentEntry[] = [
  {
    id: 'TL-CMP-BUTTON-001',
    name: 'Button',
    description:
      'Primary interactive control. Variants for intent and size, with a busy state that stays announced to assistive technology while disabled to pointer input.',
    status: 'implemented',
    phase: 2,
    module: '@/design-system/components/button',
    ariaPattern: 'button',
  },
  {
    id: 'TL-CMP-FIELD-001',
    name: 'Field',
    description:
      'Form field wrapper binding label, hint, error and control together. Errors are associated by aria-describedby and announced, not merely coloured red.',
    status: 'implemented',
    phase: 2,
    module: '@/design-system/components/field',
    ariaPattern: null,
  },
  {
    id: 'TL-CMP-INPUT-001',
    name: 'Input',
    description: 'Text input primitive with invalid state wired to the Field contract.',
    status: 'implemented',
    phase: 2,
    module: '@/design-system/components/input',
    ariaPattern: null,
  },
  {
    id: 'TL-CMP-CARD-001',
    name: 'Card',
    description: 'Surface container with header, body and footer regions.',
    status: 'implemented',
    phase: 2,
    module: '@/design-system/components/card',
    ariaPattern: null,
  },
  {
    id: 'TL-CMP-BADGE-001',
    name: 'Badge',
    description:
      'Compact status label. Never conveys meaning by colour alone — every variant carries text.',
    status: 'implemented',
    phase: 2,
    module: '@/design-system/components/badge',
    ariaPattern: null,
  },
  {
    id: 'TL-CMP-ALERT-001',
    name: 'Alert',
    description:
      'Inline message for info, success, warning and danger. Assertive variants use role="alert" so they interrupt; passive ones do not.',
    status: 'implemented',
    phase: 2,
    module: '@/design-system/components/alert',
    ariaPattern: 'alert',
  },
  {
    id: 'TL-CMP-DIALOG-001',
    name: 'Dialog',
    description:
      'Modal dialog built on the native <dialog> element, giving focus trapping, Escape handling and the top layer without a bespoke implementation.',
    status: 'implemented',
    phase: 2,
    module: '@/design-system/components/dialog',
    ariaPattern: 'dialog (modal)',
  },
  {
    id: 'TL-CMP-TABLE-001',
    name: 'Table',
    description:
      'Data table with a caption, scoped headers, and horizontal scrolling contained to the table so the page body never scrolls sideways on mobile.',
    status: 'implemented',
    phase: 2,
    module: '@/design-system/components/table',
    ariaPattern: 'table',
  },
  {
    id: 'TL-CMP-TABS-001',
    name: 'Tabs',
    description:
      'Tabbed navigation with full arrow-key roving focus, implementing the ARIA tabs pattern rather than styled buttons.',
    status: 'implemented',
    phase: 2,
    module: '@/design-system/components/tabs',
    ariaPattern: 'tabs (manual activation)',
  },
  {
    id: 'TL-CMP-SKELETON-001',
    name: 'Skeleton',
    description:
      'Loading placeholder that respects prefers-reduced-motion and is hidden from assistive technology while a live region announces the loading state instead.',
    status: 'implemented',
    phase: 2,
    module: '@/design-system/components/skeleton',
    ariaPattern: null,
  },
  {
    id: 'TL-CMP-SPINNER-001',
    name: 'Spinner',
    description: 'Indeterminate progress indicator with an accessible label.',
    status: 'implemented',
    phase: 2,
    module: '@/design-system/components/spinner',
    ariaPattern: null,
  },
  {
    id: 'TL-CMP-STATE-001',
    name: 'State Views',
    description:
      'Empty, error and loading state components. First-class primitives because these three states are certification dimensions, not edge cases to be improvised per screen (Constitution §7).',
    status: 'implemented',
    phase: 2,
    module: '@/design-system/components/state',
    ariaPattern: null,
  },
  {
    id: 'TL-CMP-ICON-001',
    name: 'Icon',
    description:
      'The single stroked icon set. Local rather than a package, so the product cannot end up with two icon styles; aria-hidden unless given a title, since almost every icon sits beside a label that already names the thing.',
    status: 'implemented',
    phase: 2,
    module: '@/design-system/components/icon',
    ariaPattern: null,
  },
  {
    id: 'TL-CMP-LOGO-001',
    name: 'Logo',
    description:
      'The Toothlogy lockup. The mark is inline SVG so it costs no request and picks up the theme; the wordmark is real text at two weights, so it stays selectable, translatable and legible to a screen reader.',
    status: 'implemented',
    phase: 2,
    module: '@/components/brand/logo',
    ariaPattern: null,
  },
  {
    id: 'TL-CMP-REVEAL-001',
    name: 'Reveal',
    description:
      'Scroll-triggered section entrance. Hides its content only when scripting is available AND motion is wanted, so a reduced-motion or no-JavaScript visitor is never left with a blank page.',
    status: 'implemented',
    phase: 2,
    module: '@/components/motion/reveal',
    ariaPattern: null,
  },
  {
    id: 'TL-CMP-COUNTER-001',
    name: 'Counter',
    description:
      'Counts a number into view. Renders the real value server-side and can never invent one; the intermediate values are aria-hidden so a screen reader announces the figure once rather than sixty times.',
    status: 'implemented',
    phase: 2,
    module: '@/components/motion/counter',
    ariaPattern: null,
  },
  {
    id: 'TL-CMP-THEMETOGGLE-001',
    name: 'Theme Toggle',
    description:
      'Switches between light, dark and system themes, persisting the choice and applying it before first paint to avoid a flash of the wrong theme.',
    status: 'implemented',
    phase: 2,
    module: '@/design-system/components/theme-toggle',
    ariaPattern: null,
  },
  {
    id: 'TL-CMP-ORG-MEMBERS-001',
    name: 'Organization Members Panel',
    description: 'Member table with role changes and two-step removal; no controls on the owner’s row.',
    status: 'implemented',
    phase: 3,
    module: '@/app/(app)/account/organizations/[id]/members-panel',
    ariaPattern: 'table with labelled selects',
  },
  {
    id: 'TL-CMP-ORG-PRACTICES-001',
    name: 'Practice Claims Panel',
    description: 'Dentists claiming to practise at the organization, with their credential state, and confirmation.',
    status: 'implemented',
    phase: 3,
    module: '@/app/(app)/account/organizations/[id]/practice-claims-panel',
    ariaPattern: 'list',
  },
  {
    id: 'TL-CMP-ORG-SERVICES-001',
    name: 'Services and Prices Panel',
    description: 'Catalogue-bound services with price, range or price-on-consultation, duration and appointment types; hide/list again.',
    status: 'implemented',
    phase: 3,
    module: '@/app/(app)/account/organizations/[id]/services-panel',
    ariaPattern: 'table and form',
  },
  {
    id: 'TL-CMP-ORG-LOCATION-EDITOR-001',
    name: 'Branch Editor',
    description: 'Facilities from the controlled list, chairs, access, home-visit radius, temporary closure and holidays for one branch.',
    status: 'implemented',
    phase: 3,
    module: '@/app/(app)/account/organizations/[id]/location-editor',
    ariaPattern: 'disclosure (details/summary) with fieldsets',
  },
  {
    id: 'TL-CMP-SLOT-PICKER-001',
    name: 'Slot Picker',
    description: 'Free dates then free times from the availability API, grouped by morning/afternoon/evening, in the branch timezone; loading, empty and error states.',
    status: 'implemented',
    phase: 4,
    module: '@/components/booking/slot-picker',
    ariaPattern: 'button groups with aria-pressed',
  },
  {
    id: 'TL-CMP-BOOKING-FLOW-001',
    name: 'Booking Flow',
    description: 'Branch, service, type, date, time, who, confirm — one idempotency key per intent; conflict refreshes the picker; waitlist and callback fallbacks.',
    status: 'implemented',
    phase: 4,
    module: '@/app/(site)/book/[slug]/booking-flow',
    ariaPattern: 'sequential fieldsets',
  },
  {
    id: 'TL-CMP-PATIENT-ACTIONS-001',
    name: 'Patient Appointment Actions',
    description: 'Confirm a held time or proposal, check in, change time via the slot picker, cancel with a reason, book again.',
    status: 'implemented',
    phase: 4,
    module: '@/app/(app)/account/appointments/[id]/patient-actions',
    ariaPattern: 'buttons with disclosure panels',
  },
  {
    id: 'TL-CMP-PRACTICE-ACTIONS-001',
    name: 'Practice Appointment Actions',
    description: 'Confirm, decline, check in, start, complete with follow-up, mark missed, move (patient must accept), cancel — reasons where the patient reads them.',
    status: 'implemented',
    phase: 4,
    module: '@/app/(app)/account/practice/practice-actions',
    ariaPattern: 'buttons with disclosure panels',
  },
  {
    id: 'TL-CMP-AVAILABILITY-EDITOR-001',
    name: 'Availability Editor',
    description: 'Weekly sessions via the hours editor; leave and blocks entered in the branch timezone; clinic hours for reference.',
    status: 'implemented',
    phase: 4,
    module: '@/app/(app)/account/practice/availability/availability-editor',
    ariaPattern: 'fieldsets and list',
  },
  {
    id: 'TL-CMP-LEAD-ACTIONS-001',
    name: 'Lead Actions',
    description: 'Status-appropriate lead actions and the charge dispute form.',
    status: 'implemented',
    phase: 4,
    module: '@/app/(app)/account/practice/leads/lead-actions',
    ariaPattern: 'buttons with disclosure panels',
  },
  {
    id: 'TL-CMP-BILLING-ACTIONS-001',
    name: 'Billing Actions',
    description: 'Issue a monthly statement; a top-up form only when a payment provider is connected.',
    status: 'implemented',
    phase: 4,
    module: '@/app/(app)/account/organizations/[id]/billing/billing-actions',
    ariaPattern: 'form',
  },
  {
    id: 'TL-CMP-STAFF-BILLING-001',
    name: 'Staff Billing Console',
    description: 'Referenced transfer credits with one key per intent, reversals with reasons, dispute decisions (never by the raiser).',
    status: 'implemented',
    phase: 4,
    module: '@/app/(app)/admin/billing/staff-billing',
    ariaPattern: 'forms and table',
  },
  {
    id: 'TL-CMP-SPONSORED-CARD-001',
    name: 'Sponsored Card',
    description: 'A paid result, always badged “Sponsored” and named for what was bought (Prime dentist / clinic / hospital), on search, profiles and the campaign preview.',
    status: 'implemented',
    phase: 4,
    module: '@/components/sponsored/sponsored-card',
    ariaPattern: 'labelled region with a single link',
  },
  {
    id: 'TL-CMP-CAMPAIGN-FORM-001',
    name: 'Campaign Form',
    description: 'Create a Prime campaign: subject, placements, dates, budget with the minimum shown, targeting by distance, treatment and appointment type, and a live Sponsored preview.',
    status: 'implemented',
    phase: 4,
    module: '@/app/(app)/account/organizations/[id]/campaigns/campaign-form',
    ariaPattern: 'form with fieldsets',
  },
  {
    id: 'TL-CMP-CAMPAIGN-ACTIONS-001',
    name: 'Campaign Actions',
    description: 'Activate (holds the budget), pause, resume, cancel (refunds the unspent part), add to budget and change targeting; one idempotency key per action.',
    status: 'implemented',
    phase: 4,
    module: '@/app/(app)/account/organizations/[id]/campaigns/[campaignId]/campaign-actions',
    ariaPattern: 'buttons with disclosure panels',
  },
  {
    id: 'TL-CMP-USE-MY-LOCATION-001',
    name: 'Use My Location',
    description:
      'Asks for the browser location only on click, rounds it to about 100 m, and uses it for that search alone — no cookie, profile field or log.',
    status: 'implemented',
    phase: 4,
    module: '@/app/(site)/find/use-my-location',
    ariaPattern: 'button with status message',
  },
  {
    id: 'TL-CMP-ORG-NEW-LOCATION-001',
    name: 'Add a Branch Form',
    description:
      'Name, URL name, timezone, contact, main-branch flag, address, map position (geocoder candidates labelled approximate when city-level) and opening hours; shows the server’s discoverability verdict.',
    status: 'implemented',
    phase: 3,
    module: '@/app/(app)/account/organizations/[id]/new-location-form',
    ariaPattern: 'form with fieldsets',
  },
  {
    id: 'TL-CMP-HOURS-EDITOR-001',
    name: 'Opening Hours Editor',
    description:
      'Monday-first weekly sessions with split shifts, copy Monday to the working week, and per-day errors for reversed or overlapping sessions.',
    status: 'implemented',
    phase: 3,
    module: '@/app/(app)/account/organizations/[id]/hours-editor',
    ariaPattern: 'fieldset of labelled groups with time inputs',
  },
  {
    id: 'TL-CMP-ORG-VERIFY-001',
    name: 'Organization Verification Submission',
    description: 'Upload registration documents and submit the organization for verification; shows the server’s list of anything missing.',
    status: 'implemented',
    phase: 3,
    module: '@/app/(app)/account/organizations/[id]/verification-panel',
    ariaPattern: 'form',
  },
  {
    id: 'TL-CMP-ACCOUNTNAV-001',
    name: 'Account Navigation',
    description:
      'Account-centre navigation: a sticky side list on wide screens, a horizontally scrolling strip on phones. Entries are decided on the server from permissions; the current page carries aria-current.',
    status: 'implemented',
    phase: 2,
    module: '@/components/account/account-nav',
    ariaPattern: 'navigation landmark',
  },
  {
    id: 'TL-CMP-PREFSYNC-001',
    name: 'Preference Sync',
    description:
      'Carries a signed-in user’s saved theme, palette, contrast, motion and text size onto the current device, so account preferences follow the person across devices.',
    status: 'implemented',
    phase: 2,
    module: '@/components/preferences/preference-sync',
    ariaPattern: null,
  },
  {
    id: 'TL-CMP-SWREGISTER-001',
    name: 'Service Worker Registration',
    description:
      'Registers the service worker in production builds only, and unregisters stale workers in development so an old cached build can never mask a code change.',
    status: 'implemented',
    phase: 2,
    module: '@/components/pwa/service-worker',
    ariaPattern: null,
  },
] as const;

export const COMPONENT_BY_ID: ReadonlyMap<string, ComponentEntry> = new Map(
  COMPONENTS.map((c) => [c.id, c]),
);

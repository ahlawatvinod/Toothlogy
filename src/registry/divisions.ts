/**
 * TOOTHLOGY DIVISION REGISTRY
 *
 * A DIVISION is a top-level capability domain. It owns its data (Constitution §8)
 * and is the sole writer of that data; other divisions read through its service
 * interface rather than writing its tables directly (Constitution P7).
 *
 * Division numbers 01–35 are permanent. A division is never renumbered, and a
 * retired division's number is never reissued (Constitution P6).
 *
 * `status` here describes the DIVISION'S IMPLEMENTATION, honestly (Constitution P9):
 *   - 'prepared'  🟡 foundation/contracts exist from Phase 0; no domain behaviour
 *   - 'planned'   🔴 registered to reserve the number and dependencies only
 *
 * No division is 'implemented'. Prompt 1 delivers Phase 0 foundation only.
 */

import type { Division } from './types';

export const DIVISIONS: readonly Division[] = [
  {
    id: 'TL-DIV-01-CORE',
    number: '01',
    slug: 'core',
    name: 'Global / Core Platform',
    description:
      'Shared platform substrate: identity, sessions, RBAC, configuration, errors, logging, HTTP conventions, events, i18n and money. Every other division consumes this and none may reimplement it.',
    status: 'prepared',
    phase: 1,
    pillars: ['TRUST', 'CONNECT'],
    dependsOn: [],
    owns: ['User', 'Session', 'Credential', 'Role', 'RoleAssignment', 'Organization', 'OrganizationMember'],
  },
  {
    id: 'TL-DIV-02-EXPERIENCE',
    number: '02',
    slug: 'experience',
    name: 'Frontend & Experience',
    description:
      'The Toothlogy design system, application shell, navigation, theming, responsive and PWA behaviour, and the accessibility baseline all surfaces inherit.',
    status: 'prepared',
    phase: 2,
    pillars: ['LEARN', 'DISCOVER', 'CONNECT'],
    dependsOn: ['TL-DIV-01-CORE'],
    owns: ['ThemePreference', 'UserPreference'],
  },
  {
    id: 'TL-DIV-03-USERS',
    number: '03',
    slug: 'users',
    name: 'Users & Patients',
    description:
      'User accounts, patient profiles, household/dependant relationships, consent records and data-export rights. Patients own their health data (Constitution P4).',
    status: 'planned',
    phase: 1,
    pillars: ['TRUST', 'CONNECT'],
    dependsOn: ['TL-DIV-01-CORE'],
    owns: ['Profile', 'PatientProfile', 'Consent', 'DataExportRequest'],
  },
  {
    id: 'TL-DIV-04-DENTISTS',
    number: '04',
    slug: 'dentists',
    name: 'Dentists',
    description:
      'Dentist profiles, qualifications, registration/licence verification, specialties, experience and practice affiliations. The subject of the DISCOVER pillar.',
    status: 'planned',
    phase: 3,
    pillars: ['DISCOVER', 'TRUST'],
    dependsOn: ['TL-DIV-01-CORE', 'TL-DIV-03-USERS'],
    owns: ['DentistProfile', 'Qualification', 'Specialty', 'LicenceVerification'],
  },
  {
    id: 'TL-DIV-05-CLINICS',
    number: '05',
    slug: 'clinics',
    name: 'Clinics & Hospitals',
    description:
      'Clinic and hospital organizations, branches, facilities, operating hours, staff rosters, service catalogues and clinic-level verification.',
    status: 'planned',
    phase: 3,
    pillars: ['DISCOVER', 'TRUST', 'BOOK'],
    dependsOn: ['TL-DIV-01-CORE', 'TL-DIV-04-DENTISTS', 'TL-DIV-29-LOCATION'],
    owns: ['Clinic', 'Branch', 'BusinessHours', 'ServiceOffering', 'ClinicVerification'],
  },
  {
    id: 'TL-DIV-06-COLLEGES',
    number: '06',
    slug: 'colleges',
    name: 'Dental Colleges',
    description:
      'Dental colleges and institutions, accreditation, departments, courses, faculty and intake information.',
    status: 'planned',
    phase: 8,
    pillars: ['LEARN', 'DISCOVER', 'TRUST'],
    dependsOn: ['TL-DIV-01-CORE', 'TL-DIV-29-LOCATION'],
    owns: ['College', 'Accreditation', 'Course', 'Department'],
  },
  {
    id: 'TL-DIV-07-STUDENTS',
    number: '07',
    slug: 'students',
    name: 'Students',
    description:
      'Student identity, enrolment, academic year, study material access, and the bridge from student to intern to practising dentist.',
    status: 'planned',
    phase: 8,
    pillars: ['LEARN', 'CONNECT'],
    dependsOn: ['TL-DIV-01-CORE', 'TL-DIV-03-USERS', 'TL-DIV-06-COLLEGES'],
    owns: ['StudentProfile', 'Enrolment'],
  },
  {
    id: 'TL-DIV-08-CAREERS',
    number: '08',
    slug: 'careers',
    name: 'Internships & Careers',
    description:
      'Internship and job postings, employer profiles, applications, resumes and placement workflows across the dental profession.',
    status: 'planned',
    phase: 8,
    pillars: ['DISCOVER', 'CONNECT'],
    dependsOn: ['TL-DIV-01-CORE', 'TL-DIV-07-STUDENTS', 'TL-DIV-05-CLINICS'],
    owns: ['JobPosting', 'Internship', 'Application', 'Resume', 'EmployerProfile'],
  },
  {
    id: 'TL-DIV-09-APPOINTMENTS',
    number: '09',
    slug: 'appointments',
    name: 'Appointments',
    description:
      'Availability, slots, booking, rescheduling, cancellation, reminders, queueing and no-show handling. The BOOK pillar made concrete.',
    status: 'planned',
    phase: 4,
    pillars: ['BOOK', 'CONNECT'],
    dependsOn: ['TL-DIV-01-CORE', 'TL-DIV-05-CLINICS', 'TL-DIV-03-USERS', 'TL-DIV-23-PAYMENTS'],
    owns: ['Appointment', 'AvailabilityRule', 'Slot', 'AppointmentStatusHistory'],
  },
  {
    id: 'TL-DIV-10-DISCOVERY',
    number: '10',
    slug: 'discovery',
    name: 'Dentist Discovery',
    description:
      'Search, ranking, filtering and recommendation for dentists and clinics. Merit ranks above spend, and promoted results are always labelled (Constitution P3).',
    status: 'planned',
    phase: 4,
    pillars: ['DISCOVER', 'TRUST'],
    dependsOn: ['TL-DIV-01-CORE', 'TL-DIV-04-DENTISTS', 'TL-DIV-05-CLINICS', 'TL-DIV-29-LOCATION', 'TL-DIV-26-REVIEWS'],
    owns: ['SearchIndexEntry', 'RankingSignal', 'DiscoveryImpression'],
  },
  {
    id: 'TL-DIV-11-RECORDS',
    number: '11',
    slug: 'records',
    name: 'Dental Records',
    description:
      'Patient clinical records, treatment history, charts, imaging and reports. Owned by the patient; clinics hold revocable, audited access grants (Constitution P4).',
    status: 'planned',
    phase: 6,
    pillars: ['TRUST', 'CONNECT'],
    dependsOn: ['TL-DIV-01-CORE', 'TL-DIV-03-USERS', 'TL-DIV-05-CLINICS', 'TL-DIV-33-SECURITY'],
    owns: ['DentalRecord', 'TreatmentEntry', 'RecordAccessGrant', 'ClinicalDocument'],
  },
  {
    id: 'TL-DIV-12-PRESCRIPTIONS',
    number: '12',
    slug: 'prescriptions',
    name: 'Prescriptions',
    description:
      'Prescription issuance, medication catalogue, dosage, validity and dispensing. Held to a clinical-safety standard (Constitution P1).',
    status: 'planned',
    phase: 6,
    pillars: ['TRUST', 'CONNECT'],
    dependsOn: ['TL-DIV-01-CORE', 'TL-DIV-04-DENTISTS', 'TL-DIV-11-RECORDS'],
    owns: ['Prescription', 'PrescriptionItem', 'Medication'],
  },
  {
    id: 'TL-DIV-13-KNOWLEDGE',
    number: '13',
    slug: 'knowledge',
    name: 'Dental Knowledge',
    description:
      'Structured, sourced dental knowledge: conditions, treatments, procedures and patient-level explanations. The backbone of the LEARN pillar.',
    status: 'planned',
    phase: 7,
    pillars: ['LEARN', 'TRUST'],
    dependsOn: ['TL-DIV-01-CORE'],
    owns: ['KnowledgeArticle', 'Condition', 'Treatment', 'Procedure', 'Citation'],
  },
  {
    id: 'TL-DIV-14-RESEARCH',
    number: '14',
    slug: 'research',
    name: 'Research',
    description:
      'Research papers, authorship, citations, journals and peer discussion for the academic dental community.',
    status: 'planned',
    phase: 7,
    pillars: ['LEARN', 'TRUST', 'CONNECT'],
    dependsOn: ['TL-DIV-01-CORE', 'TL-DIV-13-KNOWLEDGE'],
    owns: ['ResearchPaper', 'Author', 'Journal', 'CitationLink'],
  },
  {
    id: 'TL-DIV-15-MEDIA',
    number: '15',
    slug: 'media',
    name: 'Blogs, Posts & Media',
    description:
      'Community and editorial content: blogs, posts, video, images and comments, with moderation and attribution.',
    status: 'planned',
    phase: 7,
    pillars: ['LEARN', 'CONNECT'],
    dependsOn: ['TL-DIV-01-CORE', 'TL-DIV-03-USERS'],
    owns: ['Post', 'Comment', 'MediaAsset', 'ModerationDecision'],
  },
  {
    id: 'TL-DIV-16-MARKETPLACE',
    number: '16',
    slug: 'marketplace',
    name: 'Marketplace',
    description:
      'Catalogue, cart, checkout, orders, fulfilment, returns and seller management for dental goods and services.',
    status: 'planned',
    phase: 9,
    pillars: ['DISCOVER', 'BOOK', 'TRUST'],
    dependsOn: ['TL-DIV-01-CORE', 'TL-DIV-23-PAYMENTS', 'TL-DIV-17-PRODUCTS', 'TL-DIV-19-SUPPLIERS'],
    owns: ['Order', 'OrderItem', 'Cart', 'Shipment', 'ReturnRequest', 'Seller'],
  },
  {
    id: 'TL-DIV-17-PRODUCTS',
    number: '17',
    slug: 'products',
    name: 'Dental Products',
    description:
      'Product catalogue, categories, variants, specifications, pricing, stock and compliance documentation for consumables and materials.',
    status: 'planned',
    phase: 9,
    pillars: ['DISCOVER', 'TRUST'],
    dependsOn: ['TL-DIV-01-CORE'],
    owns: ['Product', 'ProductVariant', 'ProductCategory', 'PriceListEntry', 'StockLevel'],
  },
  {
    id: 'TL-DIV-18-EQUIPMENT',
    number: '18',
    slug: 'equipment',
    name: 'Dental Machinery & Equipment',
    description:
      'Capital equipment: specifications, installation, warranty, AMC, servicing history and spare parts.',
    status: 'planned',
    phase: 9,
    pillars: ['DISCOVER', 'TRUST'],
    dependsOn: ['TL-DIV-01-CORE', 'TL-DIV-17-PRODUCTS'],
    owns: ['Equipment', 'WarrantyRecord', 'ServiceContract', 'ServiceVisit'],
  },
  {
    id: 'TL-DIV-19-SUPPLIERS',
    number: '19',
    slug: 'suppliers',
    name: 'Suppliers & Manufacturers',
    description:
      'Manufacturers, distributors, wholesalers, retailers and service providers: onboarding, verification, documents and territory.',
    status: 'planned',
    phase: 9,
    pillars: ['TRUST', 'CONNECT'],
    dependsOn: ['TL-DIV-01-CORE', 'TL-DIV-29-LOCATION'],
    owns: ['Supplier', 'Manufacturer', 'Distributor', 'SupplierDocument', 'Territory'],
  },
  {
    id: 'TL-DIV-20-LEADS',
    number: '20',
    slug: 'leads',
    name: 'Leads',
    description:
      'Patient-intent leads routed to dentists and clinics, including pricing, acceptance, exclusivity, quality scoring and refunds for bad leads.',
    status: 'planned',
    phase: 10,
    pillars: ['CONNECT', 'BOOK'],
    dependsOn: ['TL-DIV-01-CORE', 'TL-DIV-10-DISCOVERY', 'TL-DIV-23-PAYMENTS'],
    owns: ['Lead', 'LeadOffer', 'LeadAcceptance', 'LeadQualityScore'],
  },
  {
    id: 'TL-DIV-21-PRIME',
    number: '21',
    slug: 'prime',
    name: 'Prime',
    description:
      'Premium membership for patients and practices: benefits, entitlements, billing cycles and a premium visual identity that remains compatible with the global design system.',
    status: 'planned',
    phase: 10,
    pillars: ['TRUST', 'BOOK'],
    dependsOn: ['TL-DIV-01-CORE', 'TL-DIV-23-PAYMENTS', 'TL-DIV-24-WALLET'],
    owns: ['Subscription', 'Plan', 'Entitlement', 'MembershipPeriod'],
  },
  {
    id: 'TL-DIV-22-ADVERTISING',
    number: '22',
    slug: 'advertising',
    name: 'Advertising & Marketing',
    description:
      'Campaigns, placements, targeting, budgets and attribution. Every promoted placement is labelled and never disguised as organic (Constitution P3).',
    status: 'planned',
    phase: 10,
    pillars: ['DISCOVER'],
    dependsOn: ['TL-DIV-01-CORE', 'TL-DIV-23-PAYMENTS', 'TL-DIV-31-ANALYTICS'],
    owns: ['Campaign', 'AdPlacement', 'AdCreative', 'Budget', 'Attribution'],
  },
  {
    id: 'TL-DIV-23-PAYMENTS',
    number: '23',
    slug: 'payments',
    name: 'Payments',
    description:
      'Payment intents, captures, refunds, provider webhooks, idempotency and reconciliation. Provider-abstracted; success is never simulated (Constitution P10).',
    status: 'prepared',
    phase: 4,
    pillars: ['BOOK', 'TRUST'],
    dependsOn: ['TL-DIV-01-CORE'],
    owns: ['Payment', 'PaymentIntent', 'Refund', 'PaymentEvent', 'Dispute'],
  },
  {
    id: 'TL-DIV-24-WALLET',
    number: '24',
    slug: 'wallet',
    name: 'Wallet & Billing',
    description:
      'Wallet balances, the double-entry ledger, invoices, tax lines, statements and payouts. Append-only: corrections are new entries, never mutations (Constitution §8).',
    status: 'planned',
    phase: 9,
    pillars: ['TRUST', 'BOOK'],
    dependsOn: ['TL-DIV-01-CORE', 'TL-DIV-23-PAYMENTS'],
    owns: ['Wallet', 'LedgerEntry', 'Invoice', 'InvoiceLine', 'TaxLine', 'Payout'],
  },
  {
    id: 'TL-DIV-25-COMMUNICATION',
    number: '25',
    slug: 'communication',
    name: 'Communication',
    description:
      'Messaging, threads, calls, notifications delivery and templates connecting every constituent pair.',
    status: 'planned',
    phase: 5,
    pillars: ['CONNECT'],
    dependsOn: ['TL-DIV-01-CORE', 'TL-DIV-03-USERS'],
    owns: ['Thread', 'Message', 'NotificationRecord', 'MessageTemplate', 'ChannelPreference'],
  },
  {
    id: 'TL-DIV-26-REVIEWS',
    number: '26',
    slug: 'reviews',
    name: 'Reviews & Trust',
    description:
      'Reviews, ratings, verification badges, trust signals and dispute handling. Subjects may respond to a review but never edit or delete it (Constitution §8).',
    status: 'planned',
    phase: 5,
    pillars: ['TRUST', 'DISCOVER'],
    dependsOn: ['TL-DIV-01-CORE', 'TL-DIV-09-APPOINTMENTS'],
    owns: ['Review', 'Rating', 'ReviewResponse', 'TrustBadge', 'VerificationRecord'],
  },
  {
    id: 'TL-DIV-27-AI',
    number: '27',
    slug: 'ai',
    name: 'AI',
    description:
      'Summarisation, triage routing, ranking assistance, translation and drafting — bound by the AI covenant (Constitution §5). AI never diagnoses.',
    status: 'planned',
    phase: 11,
    pillars: ['LEARN', 'DISCOVER', 'CONNECT'],
    dependsOn: ['TL-DIV-01-CORE', 'TL-DIV-33-SECURITY'],
    owns: ['AiInteraction', 'ModelConfiguration', 'AiAuditRecord'],
  },
  {
    id: 'TL-DIV-28-IOT',
    number: '28',
    slug: 'iot',
    name: 'IoT',
    description:
      'Connected dental devices and chairside equipment: registration, pairing, telemetry ingestion and alerting.',
    status: 'planned',
    phase: 11,
    pillars: ['CONNECT', 'TRUST'],
    dependsOn: ['TL-DIV-01-CORE', 'TL-DIV-18-EQUIPMENT'],
    owns: ['Device', 'DevicePairing', 'TelemetryReading', 'DeviceAlert'],
  },
  {
    id: 'TL-DIV-29-LOCATION',
    number: '29',
    slug: 'location',
    name: 'Location, Maps & Geofencing',
    description:
      'Geography reference data, geocoding, distance and radius search, routing and geofencing (radius, polygon, entry, exit, dwell).',
    status: 'prepared',
    phase: 1,
    pillars: ['DISCOVER', 'BOOK'],
    dependsOn: ['TL-DIV-01-CORE'],
    owns: ['Country', 'Region', 'City', 'Address', 'GeoPoint', 'Geofence'],
  },
  {
    id: 'TL-DIV-30-SUPPORT',
    number: '30',
    slug: 'support',
    name: 'Support & Help',
    description:
      'Help centre, tickets, escalation, SLAs and self-service resolution for every constituent type.',
    status: 'planned',
    phase: 5,
    pillars: ['TRUST', 'CONNECT'],
    dependsOn: ['TL-DIV-01-CORE', 'TL-DIV-25-COMMUNICATION'],
    owns: ['SupportTicket', 'HelpArticle', 'Escalation', 'SlaPolicy'],
  },
  {
    id: 'TL-DIV-31-ANALYTICS',
    number: '31',
    slug: 'analytics',
    name: 'Analytics',
    description:
      'Product and business analytics: event capture, funnels, cohorts, dashboards and reporting for practices and platform operators.',
    status: 'planned',
    phase: 10,
    pillars: ['DISCOVER', 'TRUST'],
    dependsOn: ['TL-DIV-01-CORE'],
    owns: ['AnalyticsEvent', 'Funnel', 'Report', 'Dashboard'],
  },
  {
    id: 'TL-DIV-32-ADMIN',
    number: '32',
    slug: 'admin',
    name: 'Administration',
    description:
      'Internal operations console: user and organization administration, verification queues, moderation, configuration and feature-flag control.',
    status: 'planned',
    phase: 2,
    pillars: ['TRUST'],
    dependsOn: ['TL-DIV-01-CORE', 'TL-DIV-33-SECURITY'],
    owns: ['AdminAction', 'VerificationQueueItem', 'ModerationQueueItem'],
  },
  {
    id: 'TL-DIV-33-SECURITY',
    number: '33',
    slug: 'security',
    name: 'Security & Compliance',
    description:
      'Audit log, consent and compliance records, data-retention policy, encryption key management, abuse and fraud signals. The audit log is append-only and immutable.',
    status: 'prepared',
    phase: 1,
    pillars: ['TRUST'],
    dependsOn: ['TL-DIV-01-CORE'],
    owns: ['AuditEvent', 'ComplianceRecord', 'RetentionPolicy', 'AbuseSignal'],
  },
  {
    id: 'TL-DIV-34-INTEGRATIONS',
    number: '34',
    slug: 'integrations',
    name: 'Integrations',
    description:
      'Outbound and inbound integration with external providers: adapters, credentials, webhook intake, retry and delivery monitoring. Ports live here; no provider is wired in Phase 0.',
    status: 'prepared',
    phase: 1,
    pillars: ['CONNECT'],
    dependsOn: ['TL-DIV-01-CORE'],
    owns: ['IntegrationConnection', 'WebhookDelivery', 'ProviderCredentialRef'],
  },
  {
    id: 'TL-DIV-35-DEVOPS',
    number: '35',
    slug: 'devops',
    name: 'DevOps & System',
    description:
      'Build, deploy, environments, migrations, health checks, observability, backup and recovery, and the CI verification gate.',
    status: 'prepared',
    phase: 1,
    pillars: ['TRUST'],
    dependsOn: ['TL-DIV-01-CORE'],
    owns: ['HealthCheck', 'MigrationRecord', 'SystemMetric'],
  },
] as const;

/** Lookup by division ID. */
export const DIVISION_BY_ID: ReadonlyMap<string, Division> = new Map(
  DIVISIONS.map((d) => [d.id, d]),
);

export function getDivision(id: string): Division | undefined {
  return DIVISION_BY_ID.get(id);
}

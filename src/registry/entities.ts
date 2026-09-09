/**
 * TOOTHLOGY ENTITY REGISTRY
 *
 * Registers every persisted domain object, its owning division, its sensitivity
 * classification and its lifecycle conventions (Constitution §8, §11 of the
 * founding spec).
 *
 * The registry exists to answer three questions that are otherwise answered
 * inconsistently across a large codebase:
 *
 * - **Who owns this data?** Exactly one division writes it; everyone else reads
 *   through that division's service (Constitution P7).
 * - **How sensitive is it?** `phi` data is audited, never logged, and never sent
 *   to an external analytics or AI provider without explicit consent.
 * - **What happens when it is deleted?** `softDelete: true` means rows are
 *   archived rather than removed, because something else references them —
 *   an appointment history that vanishes takes a clinical record with it.
 *
 * `model` is the Prisma model name when the entity is materialised in
 * `prisma/schema.prisma`, and `null` when the entity is registered but not yet
 * modelled. Only foundation entities are modelled in Phase 0.
 */

import type { Entity } from './types';

export const ENTITIES: readonly Entity[] = [
  // --- Division 01: Core identity ------------------------------------------
  {
    id: 'TL-ENT-USER-001',
    name: 'User',
    description:
      'A single human account. Constituent type is expressed through profiles and roles, never by having separate user tables — a dentist who is also a patient is one user (Constitution §1.1).',
    status: 'implemented',
    phase: 1,
    divisionId: 'TL-DIV-01-CORE',
    model: 'User',
    sensitivity: 'confidential',
    owner: 'the user',
    softDelete: true,
    audited: true,
  },
  {
    id: 'TL-ENT-CREDENTIAL-001',
    name: 'Credential',
    description:
      'An authentication factor: password hash, OTP secret or federated identity link. Hashes are never returned by any API and never logged.',
    status: 'implemented',
    phase: 1,
    divisionId: 'TL-DIV-01-CORE',
    model: 'Credential',
    sensitivity: 'confidential',
    owner: 'the user',
    softDelete: false,
    audited: true,
  },
  {
    id: 'TL-ENT-SESSION-001',
    name: 'Session',
    description:
      'An authenticated session. Revocable individually or in bulk, so a user can sign out everywhere after losing a device.',
    status: 'implemented',
    phase: 1,
    divisionId: 'TL-DIV-01-CORE',
    model: 'Session',
    sensitivity: 'confidential',
    owner: 'the user',
    softDelete: false,
    audited: true,
  },
  {
    id: 'TL-ENT-ROLEASSIGNMENT-001',
    name: 'RoleAssignment',
    description:
      'Grants a registry-defined role to a user, optionally scoped to one organization. Role definitions live in code; only assignments live in the database.',
    status: 'implemented',
    phase: 1,
    divisionId: 'TL-DIV-01-CORE',
    model: 'RoleAssignment',
    sensitivity: 'confidential',
    owner: 'the platform',
    softDelete: false,
    audited: true,
  },
  {
    id: 'TL-ENT-ORGANIZATION-001',
    name: 'Organization',
    description:
      'Any multi-person entity: clinic, hospital, college, supplier or employer. One shape serves all of them, so organization-scoped permissions are written once.',
    status: 'implemented',
    phase: 1,
    divisionId: 'TL-DIV-01-CORE',
    model: 'Organization',
    sensitivity: 'internal',
    owner: 'the organization',
    softDelete: true,
    audited: true,
  },
  {
    id: 'TL-ENT-ORGMEMBER-001',
    name: 'OrganizationMember',
    description: 'Membership of a user in an organization, carrying the organization-scoped role.',
    status: 'implemented',
    phase: 1,
    divisionId: 'TL-DIV-01-CORE',
    model: 'OrganizationMember',
    sensitivity: 'internal',
    owner: 'the organization',
    softDelete: false,
    audited: true,
  },
  {
    id: 'TL-ENT-PROFILE-001',
    name: 'Profile',
    description:
      'A typed profile attached to a user — patient, dentist, student, supplier. One user may hold several. Division-specific profile detail is added by that division in its own phase.',
    status: 'implemented',
    phase: 1,
    divisionId: 'TL-DIV-03-USERS',
    model: 'Profile',
    sensitivity: 'confidential',
    owner: 'the user',
    softDelete: true,
    audited: true,
  },

  // --- Division 29: Location reference data --------------------------------
  {
    id: 'TL-ENT-COUNTRY-001',
    name: 'Country',
    description:
      'Country reference data with default currency, locale, timezone and tax regime. Seeded from the globalization registry, then maintained in the database.',
    status: 'implemented',
    phase: 1,
    divisionId: 'TL-DIV-29-LOCATION',
    model: 'Country',
    sensitivity: 'public',
    owner: 'the platform',
    softDelete: false,
    audited: false,
  },
  {
    id: 'TL-ENT-REGION-001',
    name: 'Region',
    description:
      'State, province or equivalent first-level subdivision. Deliberately generic: "state" is an Indian term, not a universal one (Constitution §4).',
    status: 'implemented',
    phase: 1,
    divisionId: 'TL-DIV-29-LOCATION',
    model: 'Region',
    sensitivity: 'public',
    owner: 'the platform',
    softDelete: false,
    audited: false,
  },
  {
    id: 'TL-ENT-CITY-001',
    name: 'City',
    description: 'City or locality with coordinates, used for discovery and radius search.',
    status: 'implemented',
    phase: 1,
    divisionId: 'TL-DIV-29-LOCATION',
    model: 'City',
    sensitivity: 'public',
    owner: 'the platform',
    softDelete: false,
    audited: false,
  },
  {
    id: 'TL-ENT-ADDRESS-001',
    name: 'Address',
    description:
      'A postal address stored as structured lines plus a country-specific field map, because address shape differs by country and a fixed schema would exclude markets.',
    status: 'implemented',
    phase: 1,
    divisionId: 'TL-DIV-29-LOCATION',
    model: 'Address',
    sensitivity: 'confidential',
    owner: 'the owning subject',
    softDelete: true,
    audited: true,
  },

  // --- Division 33: Security & compliance ----------------------------------
  {
    id: 'TL-ENT-AUDITEVENT-001',
    name: 'AuditEvent',
    description:
      'Append-only record of who did what to which subject, when, from where, with what outcome. Never updated, never deleted — by any division, including this one (Constitution §8).',
    status: 'implemented',
    phase: 1,
    divisionId: 'TL-DIV-33-SECURITY',
    model: 'AuditEvent',
    sensitivity: 'confidential',
    owner: 'the platform',
    softDelete: false,
    audited: false,
  },
  {
    id: 'TL-ENT-CONSENT-001',
    name: 'Consent',
    description:
      'A recorded, purpose-scoped, revocable consent grant. Required before marketing contact, data sharing, or any AI training use (Constitution §5).',
    status: 'implemented',
    phase: 1,
    divisionId: 'TL-DIV-03-USERS',
    model: 'Consent',
    sensitivity: 'confidential',
    owner: 'the user',
    softDelete: false,
    audited: true,
  },

  // --- Division 01/34/35: Platform mechanics -------------------------------
  {
    id: 'TL-ENT-OUTBOXEVENT-001',
    name: 'OutboxEvent',
    description:
      'Transactional outbox row. A domain event is written in the same transaction as the state change it describes, so an event can never be published for a change that rolled back.',
    status: 'implemented',
    phase: 1,
    divisionId: 'TL-DIV-01-CORE',
    model: 'OutboxEvent',
    sensitivity: 'internal',
    owner: 'the platform',
    softDelete: false,
    audited: false,
  },
  {
    id: 'TL-ENT-IDEMPOTENCY-001',
    name: 'IdempotencyRecord',
    description:
      'Stores the outcome of a keyed mutation so a retried request returns the original result instead of performing the action twice. Essential for payments (Constitution §15 of the founding spec).',
    status: 'implemented',
    phase: 1,
    divisionId: 'TL-DIV-01-CORE',
    model: 'IdempotencyRecord',
    sensitivity: 'internal',
    owner: 'the platform',
    softDelete: false,
    audited: false,
  },
  {
    id: 'TL-ENT-FLAGOVERRIDE-001',
    name: 'FeatureFlagOverride',
    description:
      'Runtime override of a registry-declared flag default, so a capability can be disabled in production without a deploy.',
    status: 'implemented',
    phase: 1,
    divisionId: 'TL-DIV-32-ADMIN',
    model: 'FeatureFlagOverride',
    sensitivity: 'internal',
    owner: 'the platform',
    softDelete: false,
    audited: true,
  },
  {
    id: 'TL-ENT-FILEOBJECT-001',
    name: 'FileObject',
    description:
      'Metadata for a stored file. The bytes live with a storage provider; this row carries ownership, classification and the access rules. Sensitive files are never publicly addressable (Constitution §9).',
    status: 'implemented',
    phase: 1,
    divisionId: 'TL-DIV-01-CORE',
    model: 'FileObject',
    sensitivity: 'confidential',
    owner: 'the uploading subject',
    softDelete: true,
    audited: true,
  },
  {
    id: 'TL-ENT-NOTIFPREF-001',
    name: 'NotificationPreference',
    description:
      'Per-user, per-channel delivery preference. Transactional notifications ignore opt-out; marketing never may.',
    status: 'implemented',
    phase: 1,
    divisionId: 'TL-DIV-01-CORE',
    model: 'NotificationPreference',
    sensitivity: 'internal',
    owner: 'the user',
    softDelete: false,
    audited: true,
  },
  {
    id: 'TL-ENT-SERVICECATEGORY-001',
    name: 'Service Category',
    description:
      'A grouping of treatments in the master catalogue. Ordered manually, because alphabetical order puts diagnostics before consultation — the reverse of the order care happens in.',
    status: 'implemented',
    phase: 3,
    divisionId: 'TL-DIV-05-CLINICS',
    model: 'ServiceCategory',
    sensitivity: 'internal',
    owner: 'the platform',
    softDelete: true,
    audited: true,
  },
  {
    id: 'TL-ENT-CATALOGUESERVICE-001',
    name: 'Catalogue Service',
    description:
      'One canonical treatment. A treatment appearing in several clinical contexts has one record and extra category links, so the copies cannot drift apart in price or description.',
    status: 'implemented',
    phase: 3,
    divisionId: 'TL-DIV-05-CLINICS',
    model: 'CatalogueService',
    sensitivity: 'internal',
    owner: 'the platform',
    softDelete: true,
    audited: true,
  },
  {
    id: 'TL-ENT-SERVICEVARIANT-001',
    name: 'Service Variant',
    description:
      'A variant of a treatment, carrying its own suggested range: an anterior root canal and a molar root canal are not the same job at the same price.',
    status: 'implemented',
    phase: 3,
    divisionId: 'TL-DIV-05-CLINICS',
    model: 'ServiceVariant',
    sensitivity: 'internal',
    owner: 'the platform',
    softDelete: true,
    audited: true,
  },
  {
    id: 'TL-ENT-SERVICESYNONYM-001',
    name: 'Service Synonym',
    description:
      'A search keyword for a treatment. Patients search "RCT" and "cap", not "Root Canal Treatment" and "Crown", and a catalogue that only matches clinical vocabulary returns nothing for either.',
    status: 'implemented',
    phase: 3,
    divisionId: 'TL-DIV-05-CLINICS',
    model: 'ServiceSynonym',
    sensitivity: 'internal',
    owner: 'the platform',
    softDelete: false,
    audited: true,
  },
  {
    id: 'TL-ENT-PRICEUNIT-001',
    name: 'Price Unit',
    description:
      'What a price is per — visit, tooth, quadrant, arch, case. Reference data rather than an enum, so adding a unit is not a schema migration and a deploy.',
    status: 'implemented',
    phase: 3,
    divisionId: 'TL-DIV-05-CLINICS',
    model: 'PriceUnit',
    sensitivity: 'internal',
    owner: 'the platform',
    softDelete: false,
    audited: false,
  },
  {
    id: 'TL-ENT-DENTISTSERVICEPRICE-001',
    name: 'Dentist Service Price',
    description:
      'A dentist’s decision to offer one treatment, globally or at one clinic. Kept in a separate table from the master catalogue so that refreshing market ranges can never overwrite a price a dentist set deliberately.',
    status: 'implemented',
    phase: 3,
    divisionId: 'TL-DIV-05-CLINICS',
    model: 'DentistServicePrice',
    sensitivity: 'internal',
    owner: 'the dentist',
    softDelete: true,
    audited: true,
  },
  {
    id: 'TL-ENT-DENTISTVARIANTPRICE-001',
    name: 'Dentist Variant Price',
    description:
      'The actual figures: minimum, maximum, firm, discounted, package and additional, in minor units. Several fields rather than one, because a clinic’s answer to "what does this cost" is genuinely several answers.',
    status: 'implemented',
    phase: 3,
    divisionId: 'TL-DIV-05-CLINICS',
    model: 'DentistVariantPrice',
    sensitivity: 'internal',
    owner: 'the dentist',
    softDelete: false,
    audited: true,
  },
  {
    id: 'TL-ENT-DENTISTPACKAGE-001',
    name: 'Dentist Package',
    description:
      'A bundle sold at a single price, with its component lines and any deliberate exclusions. Contract and schema exist; no UI yet.',
    status: 'prepared',
    phase: 3,
    divisionId: 'TL-DIV-05-CLINICS',
    model: 'DentistPackage',
    sensitivity: 'internal',
    owner: 'the dentist',
    softDelete: true,
    audited: true,
  },
  {
    id: 'TL-ENT-PACKAGEITEM-001',
    name: 'Package Item',
    description:
      'One line of a package. Records exclusions as well as inclusions, because listing what is not covered is what stops a package price being read as covering more than it does.',
    status: 'prepared',
    phase: 3,
    divisionId: 'TL-DIV-05-CLINICS',
    model: 'PackageItem',
    sensitivity: 'internal',
    owner: 'the dentist',
    softDelete: false,
    audited: true,
  },
  {
    id: 'TL-ENT-PRICEHISTORY-001',
    name: 'Price History',
    description:
      'An append-only record of every price change: who, when, from what, to what. Separate from AuditEvent because this one is a product feature the dentist reads, listed per treatment rather than per actor.',
    status: 'implemented',
    phase: 3,
    divisionId: 'TL-DIV-05-CLINICS',
    model: 'PriceHistory',
    sensitivity: 'internal',
    owner: 'the dentist',
    softDelete: false,
    audited: false,
  },
] as const;

export const ENTITY_BY_ID: ReadonlyMap<string, Entity> = new Map(ENTITIES.map((e) => [e.id, e]));

/** Entities carrying protected health information. Used by redaction and export tooling. */
export const PHI_ENTITIES = ENTITIES.filter((e) => e.sensitivity === 'phi');

/**
 * TOOTHLOGY MODULE REGISTRY
 *
 * A MODULE is a coherent unit of functionality belonging to exactly one
 * division. Modules are the level at which work is planned, built and certified.
 *
 * Every module MUST map to at least one pillar (Constitution §2.1) — the
 * registry integrity test rejects an empty `pillars` array. This is the
 * mechanical form of the rule that a feature mapping to no pillar does not
 * belong in Toothlogy.
 *
 * STATUS IS REPORTED HONESTLY (Constitution P9):
 *   'implemented' 🟡→✅ code exists, is wired up, and has tests
 *   'prepared'    🟡    contracts/ports exist; no working behaviour behind them
 *   'planned'     🔴    ID reserved and dependencies recorded; no code
 *
 * Only Phase 0 foundation modules are 'implemented'. The four domain modules at
 * the bottom are the anchor IDs named in the founding specification, registered
 * now purely to reserve those IDs (Constitution P6) — they contain no code.
 */

import type { Module } from './types';

export const MODULES: readonly Module[] = [
  // =========================================================================
  // Division 01 — Core platform (Phase 0 foundation)
  // =========================================================================
  {
    id: 'TL-CORE-KERNEL-001',
    name: 'Platform Kernel',
    description:
      'Cross-cutting primitives every other module builds on: typed error taxonomy, result types, ID helpers and lifecycle conventions.',
    status: 'implemented',
    phase: 1,
    divisionId: 'TL-DIV-01-CORE',
    pillars: ['TRUST'],
    dependsOn: [],
  },
  {
    id: 'TL-CORE-CONFIG-001',
    name: 'Configuration & Environment',
    description:
      'Schema-validated environment loading. Fails fast at boot on missing or malformed configuration, and marks secrets so they can never be logged or sent to the client.',
    status: 'implemented',
    phase: 1,
    divisionId: 'TL-DIV-01-CORE',
    pillars: ['TRUST'],
    dependsOn: ['TL-CORE-KERNEL-001'],
  },
  {
    id: 'TL-CORE-HTTP-001',
    name: 'HTTP & API Conventions',
    description:
      'The shared response envelope, error mapping, pagination, filtering, sorting, idempotency, rate limiting and security headers that every API route inherits (Constitution P7).',
    status: 'implemented',
    phase: 1,
    divisionId: 'TL-DIV-01-CORE',
    pillars: ['TRUST', 'CONNECT'],
    dependsOn: ['TL-CORE-KERNEL-001', 'TL-CORE-OBSERVABILITY-001'],
  },
  {
    id: 'TL-CORE-AUTH-001',
    name: 'Authentication',
    description:
      'Principal resolution, session contracts, password hashing (scrypt) and OTP contracts. Password hashing and principal resolution are implemented; session persistence lands with the database in Phase 1.',
    status: 'prepared',
    phase: 1,
    divisionId: 'TL-DIV-01-CORE',
    pillars: ['TRUST'],
    dependsOn: ['TL-CORE-KERNEL-001', 'TL-CORE-CONFIG-001'],
  },
  {
    id: 'TL-CORE-RBAC-001',
    name: 'Authorization & RBAC',
    description:
      'Default-deny permission evaluation over roles, scopes and organization membership. The single decision point every route calls.',
    status: 'implemented',
    phase: 1,
    divisionId: 'TL-DIV-01-CORE',
    pillars: ['TRUST'],
    dependsOn: ['TL-CORE-KERNEL-001'],
  },
  {
    id: 'TL-CORE-EVENTS-001',
    name: 'Domain Event Bus',
    description:
      'In-process typed event publication and subscription, with a transport port so the same producers work unchanged against a durable queue later.',
    status: 'implemented',
    phase: 1,
    divisionId: 'TL-DIV-01-CORE',
    pillars: ['CONNECT'],
    dependsOn: ['TL-CORE-KERNEL-001', 'TL-CORE-OBSERVABILITY-001'],
  },
  {
    id: 'TL-CORE-I18N-001',
    name: 'Internationalization',
    description:
      'Locale negotiation, direction (LTR/RTL), message catalogues, and locale-aware date, number, phone and address formatting.',
    status: 'implemented',
    phase: 1,
    divisionId: 'TL-DIV-01-CORE',
    pillars: ['LEARN', 'CONNECT'],
    dependsOn: ['TL-CORE-KERNEL-001'],
  },
  {
    id: 'TL-CORE-MONEY-001',
    name: 'Money & Currency',
    description:
      'Integer minor-unit money arithmetic, currency-aware formatting and allocation without rounding loss. Floats are never used for money (Constitution §4).',
    status: 'implemented',
    phase: 1,
    divisionId: 'TL-DIV-01-CORE',
    pillars: ['BOOK', 'TRUST'],
    dependsOn: ['TL-CORE-KERNEL-001'],
  },
  {
    id: 'TL-CORE-FLAGS-001',
    name: 'Feature Flags',
    description:
      'Registry-declared flags with per-environment defaults and env overrides, driving the disabled → development → beta → enabled → deprecated lifecycle (Constitution §10).',
    status: 'implemented',
    phase: 1,
    divisionId: 'TL-DIV-01-CORE',
    pillars: ['TRUST'],
    dependsOn: ['TL-CORE-CONFIG-001'],
  },
  {
    id: 'TL-CORE-OBSERVABILITY-001',
    name: 'Logging & Observability',
    description:
      'Structured JSON logging with automatic secret/PHI redaction, request IDs, request-scoped context and health reporting. Never logs secrets (Constitution §9).',
    status: 'implemented',
    phase: 1,
    divisionId: 'TL-DIV-01-CORE',
    pillars: ['TRUST'],
    dependsOn: ['TL-CORE-KERNEL-001', 'TL-CORE-CONFIG-001'],
  },
  {
    id: 'TL-CORE-SEARCH-001',
    name: 'Search Abstraction',
    description:
      'Provider-agnostic search contract covering query, filters, facets, sorting, ranking signals, distance and pagination — shared by every searchable entity type.',
    status: 'prepared',
    phase: 1,
    divisionId: 'TL-DIV-01-CORE',
    pillars: ['DISCOVER'],
    dependsOn: ['TL-CORE-KERNEL-001'],
  },
  {
    id: 'TL-CORE-STORAGE-001',
    name: 'File Storage & Document Access',
    description:
      'Storage port plus the authorization model for sensitive documents: no sensitive file is ever publicly addressable, and access is granted per request and time-limited.',
    status: 'prepared',
    phase: 1,
    divisionId: 'TL-DIV-01-CORE',
    pillars: ['TRUST'],
    dependsOn: ['TL-CORE-KERNEL-001', 'TL-CORE-RBAC-001'],
  },
  {
    id: 'TL-CORE-NOTIFICATIONS-001',
    name: 'Notification Service',
    description:
      'Channel-agnostic notification dispatch across in-app, push, email, SMS and WhatsApp, honouring per-user channel preferences and the transactional/marketing distinction.',
    status: 'prepared',
    phase: 1,
    divisionId: 'TL-DIV-01-CORE',
    pillars: ['CONNECT'],
    dependsOn: ['TL-CORE-EVENTS-001', 'TL-INTEGRATIONS-PORTS-001'],
  },

  // =========================================================================
  // Division 02 — Frontend & Experience
  // =========================================================================
  {
    id: 'TL-EXPERIENCE-DESIGNSYSTEM-001',
    name: 'Toothlogy Design System',
    description:
      'Design tokens and accessible component primitives: typography, spacing, colour, buttons, forms, cards, dialogs, tables, tabs, badges, alerts, and the loading/empty/error state vocabulary.',
    status: 'implemented',
    phase: 2,
    divisionId: 'TL-DIV-02-EXPERIENCE',
    pillars: ['LEARN', 'DISCOVER', 'CONNECT'],
    dependsOn: ['TL-CORE-I18N-001'],
  },
  {
    id: 'TL-EXPERIENCE-SHELL-001',
    name: 'Application Shell',
    description:
      'Root layout, theming (light/dark/system), document direction, skip links, error and not-found boundaries, and the responsive/PWA baseline.',
    status: 'implemented',
    phase: 2,
    divisionId: 'TL-DIV-02-EXPERIENCE',
    pillars: ['LEARN', 'DISCOVER'],
    dependsOn: ['TL-EXPERIENCE-DESIGNSYSTEM-001', 'TL-CORE-I18N-001'],
  },

  // =========================================================================
  // Divisions 29, 23, 33, 34, 35 — foundation-bearing infrastructure
  // =========================================================================
  {
    id: 'TL-LOCATION-GEO-001',
    name: 'Geolocation & Geofencing',
    description:
      'Coordinates, haversine distance, bounding boxes for radius search, and geofence evaluation for radius and polygon shapes with entry/exit/dwell semantics.',
    status: 'prepared',
    phase: 1,
    divisionId: 'TL-DIV-29-LOCATION',
    pillars: ['DISCOVER', 'BOOK'],
    dependsOn: ['TL-CORE-KERNEL-001'],
  },
  {
    id: 'TL-PAYMENTS-GATEWAY-001',
    name: 'Payment Gateway Abstraction',
    description:
      'Provider-agnostic payment intent, capture, refund and webhook contracts with mandatory idempotency keys. No provider is wired, and success is never simulated (Constitution P10).',
    status: 'prepared',
    phase: 4,
    divisionId: 'TL-DIV-23-PAYMENTS',
    pillars: ['BOOK', 'TRUST'],
    dependsOn: ['TL-CORE-MONEY-001', 'TL-CORE-KERNEL-001'],
  },
  {
    id: 'TL-SECURITY-AUDIT-001',
    name: 'Audit Log',
    description:
      'Append-only audit trail recording actor, action, subject, outcome, request ID and timestamp for every mutation and every privileged read.',
    status: 'implemented',
    phase: 1,
    divisionId: 'TL-DIV-33-SECURITY',
    pillars: ['TRUST'],
    dependsOn: ['TL-CORE-OBSERVABILITY-001'],
  },
  {
    id: 'TL-INTEGRATIONS-PORTS-001',
    name: 'Integration Ports',
    description:
      'The hexagonal boundary for every external provider. Unconfigured providers return a typed NOT_CONFIGURED error rather than pretending to succeed.',
    status: 'prepared',
    phase: 1,
    divisionId: 'TL-DIV-34-INTEGRATIONS',
    pillars: ['CONNECT'],
    dependsOn: ['TL-CORE-KERNEL-001'],
  },
  {
    id: 'TL-DEVOPS-HEALTH-001',
    name: 'Health & Readiness',
    description:
      'Liveness and readiness reporting including dependency checks, with detail visible only to principals holding the health-read permission.',
    status: 'implemented',
    phase: 1,
    divisionId: 'TL-DIV-35-DEVOPS',
    pillars: ['TRUST'],
    dependsOn: ['TL-CORE-HTTP-001'],
  },
  {
    id: 'TL-ADMIN-REGISTRY-001',
    name: 'Registry Introspection',
    description:
      'Read-only API exposing the architecture registry so tooling, tests and the admin console can inspect divisions, modules, permissions and flags at runtime.',
    status: 'implemented',
    phase: 2,
    divisionId: 'TL-DIV-32-ADMIN',
    pillars: ['TRUST'],
    dependsOn: ['TL-CORE-HTTP-001', 'TL-CORE-RBAC-001'],
  },

  // =========================================================================
  // Phase 3 — Dentist and clinic ecosystem
  // =========================================================================
  {
    id: 'TL-DENTIST-PROFILE-001',
    name: 'Dentist Professional Profile',
    description:
      'Professional identity: qualifications, specialties, languages, fees and practice locations, with the draft/submitted/verified lifecycle that governs discoverability.',
    status: 'implemented',
    phase: 3,
    divisionId: 'TL-DIV-04-DENTISTS',
    pillars: ['DISCOVER', 'TRUST'],
    dependsOn: ['TL-CORE-RBAC-001', 'TL-CORE-KERNEL-001'],
  },
  {
    id: 'TL-CLINIC-CATALOGUE-001',
    name: 'Master Treatment Catalogue',
    description:
      'The platform-owned catalogue of dental treatments, their variants, patient-facing synonyms and suggested market price ranges. Read by everyone, written only by staff, and deliberately separate from what any dentist charges.',
    status: 'implemented',
    phase: 3,
    divisionId: 'TL-DIV-05-CLINICS',
    pillars: ['DISCOVER', 'TRUST', 'LEARN'],
    dependsOn: ['TL-CORE-RBAC-001', 'TL-CORE-KERNEL-001'],
  },
  {
    id: 'TL-CLINIC-PRICING-001',
    name: 'Dentist Price List',
    description:
      'A dentist’s own prices, per treatment, per variant and optionally per clinic, with the clinic-then-dentist-then-catalogue fallback, deterministic price display, change history and bulk editing. The master range never overwrites a dentist’s price and is never displayed as one.',
    status: 'implemented',
    phase: 3,
    divisionId: 'TL-DIV-05-CLINICS',
    pillars: ['DISCOVER', 'TRUST', 'BOOK'],
    dependsOn: ['TL-CLINIC-CATALOGUE-001', 'TL-DENTIST-PROFILE-001', 'TL-SECURITY-AUDIT-001'],
  },
  {
    id: 'TL-DENTIST-VERIFICATION-001',
    name: 'Credential Verification',
    description:
      'Evidence-backed, revocable, expiring verification of dental registrations and organizations. A reviewer may never decide their own application (Constitution P2).',
    status: 'implemented',
    phase: 3,
    divisionId: 'TL-DIV-26-REVIEWS',
    pillars: ['TRUST'],
    dependsOn: ['TL-DENTIST-PROFILE-001', 'TL-SECURITY-AUDIT-001'],
  },

  // =========================================================================
  // RESERVED ANCHOR IDs — 🔴 NOT IMPLEMENTED
  //
  // These four IDs are named in the founding specification. They are registered
  // now solely to reserve them permanently (Constitution P6) and to record their
  // dependencies. There is no code behind any of them.
  // =========================================================================
  {
    id: 'TL-DISCOVERY-DENTIST-001',
    name: 'Dentist Discovery',
    description:
      'Search, filter, rank and recommend dentists. Promoted results are labelled; merit ranks above spend (Constitution P3). RESERVED — no implementation.',
    status: 'planned',
    phase: 4,
    divisionId: 'TL-DIV-10-DISCOVERY',
    pillars: ['DISCOVER', 'TRUST'],
    dependsOn: ['TL-CORE-SEARCH-001', 'TL-LOCATION-GEO-001'],
  },
  {
    id: 'TL-APPOINTMENT-BOOKING-001',
    name: 'Appointment Booking',
    description:
      'Slot selection, booking, confirmation, rescheduling and cancellation with timezone-correct availability. RESERVED — no implementation.',
    status: 'planned',
    phase: 4,
    divisionId: 'TL-DIV-09-APPOINTMENTS',
    pillars: ['BOOK', 'CONNECT'],
    dependsOn: ['TL-CORE-EVENTS-001', 'TL-CORE-NOTIFICATIONS-001', 'TL-PAYMENTS-GATEWAY-001'],
  },
  {
    id: 'TL-PATIENT-RECORD-001',
    name: 'Patient Dental Record',
    description:
      'The patient-owned clinical record with revocable, audited access grants for clinics (Constitution P4). RESERVED — no implementation.',
    status: 'planned',
    phase: 6,
    divisionId: 'TL-DIV-11-RECORDS',
    pillars: ['TRUST', 'CONNECT'],
    dependsOn: ['TL-CORE-STORAGE-001', 'TL-SECURITY-AUDIT-001', 'TL-CORE-RBAC-001'],
  },
  {
    id: 'TL-MARKETPLACE-PRODUCT-001',
    name: 'Marketplace Product Catalogue',
    description:
      'Product listings, variants, specifications, localized pricing and stock for dental goods. RESERVED — no implementation.',
    status: 'planned',
    phase: 9,
    divisionId: 'TL-DIV-17-PRODUCTS',
    pillars: ['DISCOVER', 'TRUST'],
    dependsOn: ['TL-CORE-SEARCH-001', 'TL-CORE-MONEY-001'],
  },
] as const;

export const MODULE_BY_ID: ReadonlyMap<string, Module> = new Map(MODULES.map((m) => [m.id, m]));

export function getModule(id: string): Module | undefined {
  return MODULE_BY_ID.get(id);
}

export function modulesForDivision(divisionId: string): readonly Module[] {
  return MODULES.filter((m) => m.divisionId === divisionId);
}

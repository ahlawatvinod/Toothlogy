/**
 * TOOTHLOGY INTEGRATION TEST HELPERS
 *
 * Integration tests run against a REAL PostgreSQL database, not a mock.
 *
 * WHY NOT MOCK PRISMA
 * A mocked ORM verifies that we called the functions we think we called. It
 * cannot verify a unique constraint, a cascade delete, a transaction rollback,
 * or an `ON CONFLICT` clause — which is precisely where the interesting bugs
 * live. A test suite that mocks the database passes while double-booking is
 * possible.
 *
 * SKIPPING WHEN THERE IS NO DATABASE
 * `describeIntegration` skips rather than fails when `DATABASE_URL` is absent,
 * so `npm test` still works on a fresh clone with nothing provisioned. The skip
 * is loud — the suite name says so — because a silently skipped integration
 * suite is a green build that tested nothing.
 */

import { describe } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { setAuditSink } from '@/platform/audit';
import { writeAuditEventToDatabase } from '@/platform/db/stores';

export const hasTestDatabase = Boolean(process.env.DATABASE_URL);

let client: PrismaClient | null = null;

/** The test database client. One per process, reused across suites. */
export function testDb(): PrismaClient {
  if (!client) client = new PrismaClient();
  return client;
}

export async function disconnectTestDb(): Promise<void> {
  if (client) {
    await client.$disconnect();
    client = null;
  }
}

/**
 * A describe block that runs only with a database configured.
 *
 * The name carries the reason when skipped, so the reporter shows
 * "… [skipped: no DATABASE_URL]" rather than an unexplained absence.
 */
export const describeIntegration: typeof describe | typeof describe.skip = hasTestDatabase
  ? describe
  : ((name: string, fn: () => void) =>
      describe.skip(`${name} [skipped: no DATABASE_URL]`, fn)) as typeof describe;

/**
 * Tables that hold test-created data, in dependency order.
 *
 * Reference data seeded by `prisma/seed.mts` — countries, regions, cities, tax
 * configuration, holidays, notification templates — is deliberately NOT
 * truncated. Tests depend on it, and re-seeding before every test would make
 * the suite slow for no benefit.
 */
const MUTABLE_TABLES = [
  // Phase 4. Qualification and pricing rules are seeded reference data: kept.
  'treatment_plan_items',
  'treatment_plans',
  'exchange_rates',
  'enterprise_agreements',
  'memberships',
  'membership_plans',
  'service_visits',
  'service_contract_assets',
  'service_contracts',
  'equipment_assets',
  'order_payments',
  'tax_documents',
  'tax_document_series',
  'return_requests',
  'order_events',
  'order_lines',
  'orders',
  'cart_items',
  'product_variants',
  'enrolments',
  'device_alerts',
  'device_readings',
  'device_limits',
  'devices',
  'job_applications',
  'job_postings',
  'articles',
  'prescriptions',
  'record_entries',
  'record_access_grants',
  'support_messages',
  'support_tickets',
  'messages',
  'message_threads',
  'review_responses',
  'reviews',
  'community_reports',
  'community_answers',
  'community_questions',
  'faculty_appointments',
  'publications',
  'academic_profiles',
  'quote_events',
  'quote_requests',
  'products',
  'business_service_areas',
  'business_profiles',
  'camp_registrations',
  'camp_doctors',
  'camps',
  'admission_enquiry_events',
  'admission_enquiries',
  'admission_cycles',
  'courses',
  'college_profiles',
  'outreach_activities',
  'outreach_tasks',
  'extracted_records',
  'extraction_batches',
  'sponsored_events',
  'sponsored_campaign_days',
  'sponsored_campaigns',
  'geofences',
  'lead_disputes',
  'invoices',
  'ledger_entries',
  'wallets',
  'lead_events',
  'leads',
  'appointment_events',
  'appointments',
  'waitlist_entries',
  'dependents',
  'availability_exceptions',
  'availability_rules',
  // Phase 3. Most would go by CASCADE from users/locations anyway; listed so
  // the reset does not depend on that, and analytics_events has no FK at all.
  // treatments and specialties are reference data: not truncated.
  'analytics_events',
  'service_offerings',
  'location_closures',
  'dentist_practices',
  'verification_requests',
  'dentist_specialties',
  'qualifications',
  'dentist_profiles',
  'event_handler_receipts',
  // search_synonyms is reference data from the seed, like countries: not truncated.
  'security_events',
  'recovery_codes',
  'user_preferences',
  'file_access_logs',
  'in_app_notifications',
  'notification_records',
  'login_attempts',
  'rate_limit_counters',
  'idempotency_records',
  'verification_tokens',
  'account_deletion_requests',
  'saved_locations',
  'business_hours',
  'locations',
  'invitations',
  'sessions',
  'credentials',
  'role_assignments',
  'organization_members',
  'consents',
  'profiles',
  'notification_preferences',
  'file_objects',
  'audit_events',
  'outbox_events',
  'geofences',
  'search_documents',
  'organizations',
  'addresses',
  'users',
] as const;

/**
 * Refuse to truncate anything that is not a disposable test database.
 *
 * `resetDatabase` erases every mutable table. Run against a development or
 * production database it destroys real data with no way back, and the only
 * thing standing between a misconfigured `DATABASE_URL` and that outcome would
 * otherwise be the developer noticing in time. The database name must end in
 * `_test`; CI's ephemeral service and the local `toothlogy_test` both do.
 */
export function assertDisposableDatabase(url: string | undefined = process.env.DATABASE_URL): void {
  const name = url ? new URL(url).pathname.replace(/^\//, '') : '';
  if (!/_test$/.test(name)) {
    throw new Error(
      `Refusing to truncate database '${name || '(none)'}': integration tests only run against a database whose name ends in "_test". Set TEST_DATABASE_URL.`,
    );
  }
}

/**
 * Empty every mutable table.
 *
 * `TRUNCATE … CASCADE` in one statement rather than per-table deletes: it is
 * dramatically faster, and it sidesteps foreign-key ordering entirely, so
 * adding a table to the list above never requires working out where in the
 * dependency graph it belongs.
 */
export async function resetDatabase(): Promise<void> {
  if (!hasTestDatabase) return;
  assertDisposableDatabase();
  const quoted = MUTABLE_TABLES.map((t) => `"${t}"`).join(', ');
  await testDb().$executeRawUnsafe(`TRUNCATE TABLE ${quoted} RESTART IDENTITY CASCADE`);
  // Seeded country-wide pricing is reference data and stays; rules a test
  // created for one organization or dentist go with that test's data.
  await testDb().$executeRawUnsafe(`DELETE FROM "lead_pricing_rules" WHERE "organizationId" IS NOT NULL OR "dentistProfileId" IS NOT NULL`);
}

/**
 * Confirm the reference seed is present.
 *
 * Called once per integration suite. Without it, a failure caused by an
 * unseeded database presents as a confusing assertion error deep inside a test
 * rather than as "you forgot to run npm run db:seed".
 */
/**
 * Route audit events to the database for this test.
 *
 * `tests/setup.ts` resets the audit sink after every test so suites cannot leak
 * into each other, which means an integration test asserting on audit rows has
 * to install the database sink itself. Call this in `beforeEach`, after the
 * global reset has run.
 */
export function useDatabaseAuditSink(): void {
  if (!hasTestDatabase) return;
  setAuditSink(async (event) => {
    await writeAuditEventToDatabase(event);
  });
}

export async function assertSeeded(): Promise<void> {
  if (!hasTestDatabase) return;
  const countries = await testDb().country.count();
  if (countries === 0) {
    throw new Error(
      'Test database has no reference data. Run: npm run db:migrate && npm run db:seed',
    );
  }
}

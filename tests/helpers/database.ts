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
  // Dentist pricing. The master catalogue tables — service_categories,
  // catalogue_services, service_variants, service_synonyms, price_units — are
  // reference data seeded by prisma/seed.mts and are deliberately NOT listed,
  // for the same reason countries and specialties are not: tests depend on
  // them, and re-seeding before every test would make the suite slow for no
  // benefit.
  'price_history',
  'package_items',
  'dentist_packages',
  'dentist_variant_prices',
  'dentist_service_prices',
  'in_app_notifications',
  'notification_records',
  'login_attempts',
  'rate_limit_counters',
  'idempotency_records',
  'verification_tokens',
  'account_deletion_requests',
  'saved_locations',
  'business_hours',
  'service_offerings',
  'dentist_practices',
  'qualifications',
  'dentist_specialties',
  'verification_requests',
  'dentist_profiles',
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
 * Empty every mutable table.
 *
 * `TRUNCATE … CASCADE` in one statement rather than per-table deletes: it is
 * dramatically faster, and it sidesteps foreign-key ordering entirely, so
 * adding a table to the list above never requires working out where in the
 * dependency graph it belongs.
 */
export async function resetDatabase(): Promise<void> {
  if (!hasTestDatabase) return;
  const quoted = MUTABLE_TABLES.map((t) => `"${t}"`).join(', ');
  await testDb().$executeRawUnsafe(`TRUNCATE TABLE ${quoted} RESTART IDENTITY CASCADE`);
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

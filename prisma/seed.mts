/**
 * TOOTHLOGY SEED
 *
 * Loads the reference data the platform needs to function: countries, regions,
 * cities, tax configuration, holidays and notification templates.
 *
 * IDEMPOTENT BY DESIGN
 * Every write is an upsert keyed on natural identity, so running the seed twice
 * changes nothing. A seed that must only run once is a seed that will eventually
 * be run twice — after a restore, in a new environment, by a script that
 * retried — and duplicate reference data is subtle: two "Maharashtra" rows do
 * not error, they just make half the clinics unfindable.
 *
 * REFERENCE DATA IS NOT DEMO DATA
 * This creates no users, clinics or appointments. Seeded demo content has a way
 * of surviving into production and being mistaken for real activity. Countries
 * and tax rates are infrastructure; a fake dentist is not.
 *
 * Run: npm run db:seed
 */

import { PrismaClient } from '@prisma/client';
import { COUNTRIES } from '../src/registry/globalization.ts';
import { NOTIFICATIONS } from '../src/registry/events.ts';
import { DENTAL_SPECIALTIES } from '../src/platform/dentists/specialties.ts';

const prisma = new PrismaClient();

/** Deterministic IDs so re-running upserts the same rows. */
function seedId(prefix: string, ...parts: string[]): string {
  return `${prefix}_seed_${parts.join('_').toLowerCase().replace(/[^a-z0-9_]+/g, '')}`;
}

async function seedCountries(): Promise<number> {
  for (const country of COUNTRIES) {
    await prisma.country.upsert({
      where: { code: country.code },
      create: {
        code: country.code,
        name: country.name,
        defaultCurrency: country.defaultCurrency,
        defaultLocale: country.defaultLocale,
        defaultTimezone: country.defaultTimezone,
        callingCode: country.callingCode,
        taxRegime: country.taxRegime.toUpperCase() as 'GST' | 'VAT' | 'SALES_TAX' | 'NONE',
        enabled: country.enabled,
      },
      // Name and defaults may be corrected over time; `enabled` is deliberately
      // NOT updated, because opening a market is an operational decision made in
      // the database and must not be reverted by a deploy.
      update: {
        name: country.name,
        defaultCurrency: country.defaultCurrency,
        defaultLocale: country.defaultLocale,
        defaultTimezone: country.defaultTimezone,
        callingCode: country.callingCode,
      },
    });
  }
  return COUNTRIES.length;
}

/**
 * Indian states and union territories.
 *
 * The full set, not a sample: a patient in a state we omitted cannot complete
 * an address, and "we only seeded the big ones" is invisible until someone in
 * Tripura tries to register.
 */
const INDIAN_REGIONS: ReadonlyArray<{ name: string; code: string }> = [
  { name: 'Andhra Pradesh', code: 'AP' },
  { name: 'Arunachal Pradesh', code: 'AR' },
  { name: 'Assam', code: 'AS' },
  { name: 'Bihar', code: 'BR' },
  { name: 'Chhattisgarh', code: 'CG' },
  { name: 'Goa', code: 'GA' },
  { name: 'Gujarat', code: 'GJ' },
  { name: 'Haryana', code: 'HR' },
  { name: 'Himachal Pradesh', code: 'HP' },
  { name: 'Jharkhand', code: 'JH' },
  { name: 'Karnataka', code: 'KA' },
  { name: 'Kerala', code: 'KL' },
  { name: 'Madhya Pradesh', code: 'MP' },
  { name: 'Maharashtra', code: 'MH' },
  { name: 'Manipur', code: 'MN' },
  { name: 'Meghalaya', code: 'ML' },
  { name: 'Mizoram', code: 'MZ' },
  { name: 'Nagaland', code: 'NL' },
  { name: 'Odisha', code: 'OD' },
  { name: 'Punjab', code: 'PB' },
  { name: 'Rajasthan', code: 'RJ' },
  { name: 'Sikkim', code: 'SK' },
  { name: 'Tamil Nadu', code: 'TN' },
  { name: 'Telangana', code: 'TS' },
  { name: 'Tripura', code: 'TR' },
  { name: 'Uttar Pradesh', code: 'UP' },
  { name: 'Uttarakhand', code: 'UK' },
  { name: 'West Bengal', code: 'WB' },
  { name: 'Andaman and Nicobar Islands', code: 'AN' },
  { name: 'Chandigarh', code: 'CH' },
  { name: 'Dadra and Nagar Haveli and Daman and Diu', code: 'DH' },
  { name: 'Delhi', code: 'DL' },
  { name: 'Jammu and Kashmir', code: 'JK' },
  { name: 'Ladakh', code: 'LA' },
  { name: 'Lakshadweep', code: 'LD' },
  { name: 'Puducherry', code: 'PY' },
];

/**
 * Major cities with coordinates.
 *
 * Coordinates are the point: discovery ranks by distance, and a city row
 * without a location cannot participate in a radius search. A larger gazetteer
 * is imported in Phase 4; this is enough for the first market's metros.
 */
const INDIAN_CITIES: ReadonlyArray<{
  name: string;
  region: string;
  latitude: number;
  longitude: number;
}> = [
  { name: 'Mumbai', region: 'Maharashtra', latitude: 19.076, longitude: 72.8777 },
  { name: 'Pune', region: 'Maharashtra', latitude: 18.5204, longitude: 73.8567 },
  { name: 'Nagpur', region: 'Maharashtra', latitude: 21.1458, longitude: 79.0882 },
  { name: 'Delhi', region: 'Delhi', latitude: 28.6139, longitude: 77.209 },
  { name: 'Bengaluru', region: 'Karnataka', latitude: 12.9716, longitude: 77.5946 },
  { name: 'Mysuru', region: 'Karnataka', latitude: 12.2958, longitude: 76.6394 },
  { name: 'Chennai', region: 'Tamil Nadu', latitude: 13.0827, longitude: 80.2707 },
  { name: 'Coimbatore', region: 'Tamil Nadu', latitude: 11.0168, longitude: 76.9558 },
  { name: 'Hyderabad', region: 'Telangana', latitude: 17.385, longitude: 78.4867 },
  { name: 'Kolkata', region: 'West Bengal', latitude: 22.5726, longitude: 88.3639 },
  { name: 'Ahmedabad', region: 'Gujarat', latitude: 23.0225, longitude: 72.5714 },
  { name: 'Surat', region: 'Gujarat', latitude: 21.1702, longitude: 72.8311 },
  { name: 'Jaipur', region: 'Rajasthan', latitude: 26.9124, longitude: 75.7873 },
  { name: 'Lucknow', region: 'Uttar Pradesh', latitude: 26.8467, longitude: 80.9462 },
  { name: 'Kanpur', region: 'Uttar Pradesh', latitude: 26.4499, longitude: 80.3319 },
  { name: 'Raipur', region: 'Chhattisgarh', latitude: 21.2514, longitude: 81.6296 },
  { name: 'Bhilai', region: 'Chhattisgarh', latitude: 21.1938, longitude: 81.3509 },
  { name: 'Bhopal', region: 'Madhya Pradesh', latitude: 23.2599, longitude: 77.4126 },
  { name: 'Indore', region: 'Madhya Pradesh', latitude: 22.7196, longitude: 75.8577 },
  { name: 'Patna', region: 'Bihar', latitude: 25.5941, longitude: 85.1376 },
  { name: 'Kochi', region: 'Kerala', latitude: 9.9312, longitude: 76.2673 },
  { name: 'Thiruvananthapuram', region: 'Kerala', latitude: 8.5241, longitude: 76.9366 },
  { name: 'Chandigarh', region: 'Chandigarh', latitude: 30.7333, longitude: 76.7794 },
  { name: 'Bhubaneswar', region: 'Odisha', latitude: 20.2961, longitude: 85.8245 },
  { name: 'Guwahati', region: 'Assam', latitude: 26.1445, longitude: 91.7362 },
];

async function seedIndianGeography(): Promise<{ regions: number; cities: number }> {
  const regionIds = new Map<string, string>();

  for (const region of INDIAN_REGIONS) {
    const id = seedId('reg', 'in', region.code);
    await prisma.region.upsert({
      where: { countryCode_name: { countryCode: 'IN', name: region.name } },
      create: { id, countryCode: 'IN', name: region.name, code: region.code },
      update: { code: region.code },
    });
    regionIds.set(region.name, id);
  }

  // Read back rather than trusting the generated id: an upsert that matched an
  // existing row keeps that row's original id.
  const persisted = await prisma.region.findMany({ where: { countryCode: 'IN' } });
  for (const region of persisted) regionIds.set(region.name, region.id);

  let cityCount = 0;
  for (const city of INDIAN_CITIES) {
    const regionId = regionIds.get(city.region);
    if (!regionId) {
      console.warn(`Skipping ${city.name}: region ${city.region} not found.`);
      continue;
    }

    await prisma.city.upsert({
      where: { regionId_name: { regionId, name: city.name } },
      create: {
        id: seedId('cty', 'in', city.name),
        regionId,
        name: city.name,
        latitude: city.latitude,
        longitude: city.longitude,
      },
      update: { latitude: city.latitude, longitude: city.longitude },
    });
    cityCount += 1;
  }

  return { regions: INDIAN_REGIONS.length, cities: cityCount };
}

/**
 * Indian GST for dental goods and services.
 *
 * Rates are in basis points and carry an effective date, because a rate change
 * must not rewrite history: an invoice raised last year has to reproduce the
 * rate that applied then.
 *
 * Dental services are largely GST-exempt in India as healthcare services, which
 * is why services are seeded at 0 rather than omitted — an absent row would
 * read as "unknown", and the pricing engine must be able to tell the difference
 * between exempt and unconfigured.
 */
async function seedTaxConfiguration(): Promise<number> {
  const configurations = [
    { category: 'dental_services', rateBasisPoints: 0 },
    { category: 'dental_products', rateBasisPoints: 1200 },
    { category: 'dental_equipment', rateBasisPoints: 1800 },
    { category: 'platform_fees', rateBasisPoints: 1800 },
  ];

  const effectiveFrom = new Date('2024-01-01T00:00:00Z');

  for (const config of configurations) {
    const id = seedId('tax', 'in', config.category);
    const existing = await prisma.taxConfiguration.findFirst({
      where: { countryCode: 'IN', category: config.category, effectiveFrom },
    });

    if (existing) {
      await prisma.taxConfiguration.update({
        where: { id: existing.id },
        data: { rateBasisPoints: config.rateBasisPoints },
      });
    } else {
      await prisma.taxConfiguration.create({
        data: {
          id,
          countryCode: 'IN',
          regime: 'GST',
          category: config.category,
          rateBasisPoints: config.rateBasisPoints,
          effectiveFrom,
        },
      });
    }
  }

  return configurations.length;
}

/** Indian national holidays. State holidays are added per region in Phase 4. */
async function seedHolidays(): Promise<number> {
  const holidays = [
    { date: '2026-01-26', name: 'Republic Day' },
    { date: '2026-08-15', name: 'Independence Day' },
    { date: '2026-10-02', name: 'Gandhi Jayanti' },
    { date: '2027-01-26', name: 'Republic Day' },
    { date: '2027-08-15', name: 'Independence Day' },
    { date: '2027-10-02', name: 'Gandhi Jayanti' },
  ];

  for (const holiday of holidays) {
    const date = new Date(`${holiday.date}T00:00:00Z`);
    const existing = await prisma.holiday.findFirst({
      where: { countryCode: 'IN', regionId: null, date, name: holiday.name },
    });

    if (!existing) {
      await prisma.holiday.create({
        data: {
          id: seedId('hol', 'in', holiday.date, holiday.name),
          countryCode: 'IN',
          date,
          name: holiday.name,
          isPublic: true,
        },
      });
    }
  }

  return holidays.length;
}

/**
 * In-app notification templates for every registered notification.
 *
 * In-app is seeded for all of them because it is the one channel with no
 * external provider — it always works. Email, SMS and WhatsApp templates are
 * added when their adapters are configured, since a template for a channel that
 * cannot send is of no use.
 */
async function seedNotificationTemplates(): Promise<number> {
  for (const notification of NOTIFICATIONS) {
    await prisma.notificationTemplate.upsert({
      where: {
        notificationId_channel_locale: {
          notificationId: notification.id,
          channel: 'IN_APP',
          locale: 'en',
        },
      },
      create: {
        id: seedId('ntf', notification.id),
        notificationId: notification.id,
        channel: 'IN_APP',
        locale: 'en',
        subject: notification.name,
        body: notification.description,
        isActive: true,
      },
      update: { subject: notification.name, body: notification.description },
    });
  }
  return NOTIFICATIONS.length;
}

/*
 * The specialty list itself lives in `src/platform/dentists/specialties.ts`, so
 * the database and the public site cannot disagree about what a specialty is
 * called. See that file for why.
 */
const SPECIALTIES = DENTAL_SPECIALTIES;

async function seedSpecialties(): Promise<number> {
  for (const specialty of SPECIALTIES) {
    await prisma.specialty.upsert({
      where: { key: specialty.key },
      create: {
        id: seedId('spc', specialty.key),
        key: specialty.key,
        name: specialty.name,
        description: specialty.description,
      },
      update: { name: specialty.name, description: specialty.description },
    });
  }
  return SPECIALTIES.length;
}

async function main(): Promise<void> {
  console.log('Seeding Toothlogy reference data...\n');

  const countries = await seedCountries();
  console.log(`  countries              ${countries}`);

  const geography = await seedIndianGeography();
  console.log(`  regions (IN)           ${geography.regions}`);
  console.log(`  cities (IN)            ${geography.cities}`);

  const tax = await seedTaxConfiguration();
  console.log(`  tax configurations     ${tax}`);

  const holidays = await seedHolidays();
  console.log(`  holidays (IN)          ${holidays}`);

  const templates = await seedNotificationTemplates();
  console.log(`  notification templates ${templates}`);

  const specialties = await seedSpecialties();
  console.log(`  dental specialties     ${specialties}`);

  console.log('\nSeed complete. No users, clinics or appointments were created.');
}

main()
  .catch((error: unknown) => {
    console.error('Seed failed:', error);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });

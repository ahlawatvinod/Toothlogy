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
import { TREATMENTS } from '../src/platform/catalogue/treatments.ts';

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
 * Notification templates, English.
 *
 * Placeholders in `{braces}` are exactly the data keys the sending services
 * pass — a placeholder with no matching key renders literally, which the
 * notification tests would catch. SMS copy stays under 160 characters where
 * the link allows, because a split SMS costs twice as much and arrives out of
 * order on some handsets.
 *
 * WhatsApp is not seeded: outside the 24-hour window WhatsApp only accepts
 * templates pre-approved by Meta, identified by a provider template id that
 * does not exist until an account is configured. Push reuses the in-app copy.
 *
 * Other locales are added by translators; nothing here is machine-translated.
 */
type Channel = 'IN_APP' | 'EMAIL' | 'SMS';
const TEMPLATES: ReadonlyArray<{ id: string; channel: Channel; subject?: string; body: string }> = [
  // --- Account & security ----------------------------------------------------
  { id: 'TL-NOTIF-WELCOME-001', channel: 'IN_APP', subject: 'Welcome to Toothlogy', body: 'Hi {name}, your account is ready. Complete your profile so dentists and clinics can recognise you.' },
  { id: 'TL-NOTIF-WELCOME-001', channel: 'EMAIL', subject: 'Welcome to Toothlogy', body: 'Hi {name},\n\nYour Toothlogy account is ready. You can find verified dentists near you, book appointments and keep your dental records in one place.' },
  { id: 'TL-NOTIF-EMAIL-VERIFY-001', channel: 'EMAIL', subject: 'Confirm your email address', body: 'Hi {name},\n\nConfirm that this is your email address by opening the link below. The link works once and expires in 24 hours.\n\n{verifyUrl}\n\nIf you did not create a Toothlogy account, you can ignore this email.' },
  { id: 'TL-NOTIF-PHONE-OTP-001', channel: 'SMS', body: 'Your Toothlogy code is {code}. It expires in {minutes} minutes. Never share this code with anyone.' },
  { id: 'TL-NOTIF-PASSWORD-RESET-001', channel: 'EMAIL', subject: 'Reset your Toothlogy password', body: 'Someone asked to reset the password for this Toothlogy account.\n\nOpen the link below to choose a new password. It works once and expires in 30 minutes.\n\n{resetUrl}\n\nIf this was not you, ignore this email. Your password has not changed.' },
  { id: 'TL-NOTIF-SECURITY-ALERT-001', channel: 'IN_APP', subject: 'Security alert', body: '{alert} on {when} (network {ipAddress}). If this was not you, change your password and sign out other devices.' },
  { id: 'TL-NOTIF-SECURITY-ALERT-001', channel: 'EMAIL', subject: 'Security alert on your Toothlogy account', body: '{alert}.\n\nWhen: {when}\nNetwork: {ipAddress}\n\nIf this was you, there is nothing to do. If it was not, change your password now and sign out of other devices from your security settings.' },
  { id: 'TL-NOTIF-SECURITY-ALERT-001', channel: 'SMS', body: 'Toothlogy security alert: {alert}. Not you? Change your password now.' },
  { id: 'TL-NOTIF-ORG-INVITATION-001', channel: 'EMAIL', subject: 'You are invited to join {organization} on Toothlogy', body: '{inviter} has invited you to join {organization} on Toothlogy as {role}.\n\nAccept the invitation here. The link works once and expires in 7 days.\n\n{inviteUrl}' },
  { id: 'TL-NOTIF-ORG-MEMBER-JOINED-001', channel: 'IN_APP', subject: 'New member', body: '{member} joined {organization} as {role}.' },

  // --- Trust -------------------------------------------------------------------
  { id: 'TL-NOTIF-VERIFICATION-RESULT-001', channel: 'IN_APP', subject: 'Verification update', body: 'Verification of {subject} {outcome}. {reason}' },
  { id: 'TL-NOTIF-VERIFICATION-RESULT-001', channel: 'EMAIL', subject: 'Verification update', body: 'Verification of {subject} {outcome}.\n\n{reason}\n\nSee the details, and what to do next, in your Toothlogy account.' },
  { id: 'TL-NOTIF-VERIFICATION-RESULT-001', channel: 'SMS', body: 'Toothlogy: verification of {subject} {outcome}. Details are in your account.' },
  { id: 'TL-NOTIF-PRACTICE-CLAIM-001', channel: 'IN_APP', subject: 'Practice claim to review', body: '{dentist} says they practise at {location}. Confirm the claim only if they do.' },
  { id: 'TL-NOTIF-PRACTICE-CLAIM-001', channel: 'EMAIL', subject: 'A dentist claimed to practise at {location}', body: '{dentist} says they practise at {location}.\n\nThey will not appear in patient search for this location until you confirm. Confirm only if they genuinely practise there.' },
  { id: 'TL-NOTIF-PRACTICE-CONFIRMED-001', channel: 'IN_APP', subject: 'Practice confirmed', body: '{organization} confirmed you practise at {location}.' },
  { id: 'TL-NOTIF-PRACTICE-CONFIRMED-001', channel: 'EMAIL', subject: 'Your practice at {location} is confirmed', body: '{organization} confirmed that you practise at {location}. If your credentials are verified, patients can now find you there.' },

  // --- Appointments ------------------------------------------------------------
  { id: 'TL-NOTIF-APPOINTMENT-CREATED-001', channel: 'IN_APP', subject: 'New appointment {status}', body: '{patient}: {when} with {dentist} at {location}.' },
  { id: 'TL-NOTIF-APPOINTMENT-CREATED-001', channel: 'EMAIL', subject: 'New appointment {status}', body: '{patient} has a new appointment {status}.\n\nWhen: {when}\nDentist: {dentist}\nLocation: {location}' },
  { id: 'TL-NOTIF-APPOINTMENT-CONFIRMED-001', channel: 'IN_APP', subject: 'Appointment confirmed', body: '{when} with {dentist} at {location}.' },
  { id: 'TL-NOTIF-APPOINTMENT-CONFIRMED-001', channel: 'EMAIL', subject: 'Your appointment is confirmed', body: 'Your appointment is confirmed.\n\nWhen: {when}\nDentist: {dentist}\nWhere: {location}, {address}\n\nNeed to change it? Reschedule or cancel from your appointments page.' },
  { id: 'TL-NOTIF-APPOINTMENT-CONFIRMED-001', channel: 'SMS', body: 'Toothlogy: confirmed {when} with {dentist}, {location}.' },
  { id: 'TL-NOTIF-APPOINTMENT-REJECTED-001', channel: 'IN_APP', subject: 'Appointment not confirmed', body: 'Your request for {when} with {dentist} was not confirmed. {reason} Other times are available.' },
  { id: 'TL-NOTIF-APPOINTMENT-REJECTED-001', channel: 'EMAIL', subject: 'Your appointment request was not confirmed', body: 'Your request for {when} with {dentist} was not confirmed.\n\n{reason}\n\nOther available times, and other nearby dentists, are one tap away in Toothlogy.' },
  { id: 'TL-NOTIF-APPOINTMENT-REJECTED-001', channel: 'SMS', body: 'Toothlogy: your request for {when} with {dentist} was not confirmed. Book another time in the app.' },
  { id: 'TL-NOTIF-APPOINTMENT-CANCELLED-001', channel: 'IN_APP', subject: 'Appointment cancelled', body: '{when} with {dentist} was cancelled by {cancelledBy}.' },
  { id: 'TL-NOTIF-APPOINTMENT-CANCELLED-001', channel: 'EMAIL', subject: 'Appointment cancelled', body: 'The appointment on {when} with {dentist} was cancelled by {cancelledBy}.\n\n{reason}' },
  { id: 'TL-NOTIF-APPOINTMENT-CANCELLED-001', channel: 'SMS', body: 'Toothlogy: {when} with {dentist} was cancelled by {cancelledBy}.' },
  { id: 'TL-NOTIF-APPOINTMENT-RESCHEDULED-001', channel: 'IN_APP', subject: 'Appointment moved', body: 'Moved from {oldWhen} to {when} with {dentist}.' },
  { id: 'TL-NOTIF-APPOINTMENT-RESCHEDULED-001', channel: 'EMAIL', subject: 'Your appointment has moved', body: 'Your appointment with {dentist} has moved.\n\nWas: {oldWhen}\nNow: {when}' },
  { id: 'TL-NOTIF-APPOINTMENT-RESCHEDULED-001', channel: 'SMS', body: 'Toothlogy: your appointment with {dentist} moved to {when}.' },
  { id: 'TL-NOTIF-APPOINTMENT-REQUESTED-001', channel: 'IN_APP', subject: 'Request sent', body: 'You asked for {when} with {dentist} at {location}. The practice will confirm or decline by {respondBy}; the time is held for you meanwhile.' },
  { id: 'TL-NOTIF-APPOINTMENT-REQUESTED-001', channel: 'EMAIL', subject: 'Your appointment request was sent', body: 'You asked for an appointment.\n\nWhen: {when}\nDentist: {dentist}\nWhere: {location}\n\nThis is a request, not yet a booking. The practice will confirm or decline by {respondBy}.' },
  { id: 'TL-NOTIF-APPOINTMENT-CHECKED-IN-001', channel: 'IN_APP', subject: 'Checked in', body: '{who} for {when} with {dentist}.' },
  { id: 'TL-NOTIF-APPOINTMENT-REMINDER-001', channel: 'IN_APP', subject: 'Appointment tomorrow', body: 'Tomorrow: {when} with {dentist} at {location}.' },
  { id: 'TL-NOTIF-APPOINTMENT-REMINDER-001', channel: 'SMS', body: 'Reminder: tomorrow {when} with {dentist}, {location}. Manage it in the Toothlogy app.' },
  { id: 'TL-NOTIF-APPOINTMENT-TODAY-001', channel: 'IN_APP', subject: 'Appointment today', body: 'Today: {when} with {dentist} at {location}.' },
  { id: 'TL-NOTIF-APPOINTMENT-TODAY-001', channel: 'SMS', body: 'Toothlogy: today {when} with {dentist}, {location}.' },
  { id: 'TL-NOTIF-APPOINTMENT-SOON-001', channel: 'IN_APP', subject: 'Appointment soon', body: 'Starting soon: {when} with {dentist} at {location}. You can check in from your appointment page when you arrive.' },
  { id: 'TL-NOTIF-APPOINTMENT-SOON-001', channel: 'SMS', body: 'Toothlogy: starting soon, {when} with {dentist}, {location}.' },
  // Reviews are Phase 5 and not built: this message must not invite one yet.
  { id: 'TL-NOTIF-APPOINTMENT-COMPLETED-001', channel: 'IN_APP', subject: 'Thanks for visiting', body: 'Your visit with {dentist} is complete. {followUp} How was it? You can rate your visit on the appointment page.' },
  { id: 'TL-NOTIF-APPOINTMENT-COMPLETED-001', channel: 'EMAIL', subject: 'Your visit is complete', body: 'Thank you for visiting {dentist}.\n\n{followUp}\n\nHow was it? You can rate your visit, and book again with the same dentist, from your appointments page.' },
  { id: 'TL-NOTIF-FOLLOW-UP-DUE-001', channel: 'IN_APP', subject: 'Follow-up due', body: '{dentist} recommended a follow-up ({service}). Book it in one tap.' },
  { id: 'TL-NOTIF-FOLLOW-UP-DUE-001', channel: 'EMAIL', subject: 'Your follow-up is due', body: '{dentist} recommended a follow-up for {service}, and it is now due.\n\nBook it in one tap from your appointments page.' },
  { id: 'TL-NOTIF-FOLLOW-UP-DUE-001', channel: 'SMS', body: 'Toothlogy: your follow-up with {dentist} is due. Book in the app.' },
  { id: 'TL-NOTIF-WAITLIST-OFFER-001', channel: 'IN_APP', subject: 'A slot opened up', body: '{when} with {dentist} is now free. The first person to book it gets it.' },
  { id: 'TL-NOTIF-WAITLIST-OFFER-001', channel: 'SMS', body: 'Toothlogy: {when} with {dentist} just opened up. Book in the app.' },

  // --- Leads & billing ---------------------------------------------------------
  { id: 'TL-NOTIF-LEAD-OFFER-001', channel: 'IN_APP', subject: 'New patient request', body: 'A patient near {area} is looking for {treatment}. Accepting costs {price}.' },
  { id: 'TL-NOTIF-LEAD-OFFER-001', channel: 'EMAIL', subject: 'New patient request: {treatment}', body: 'A patient near {area} is looking for {treatment}.\n\nAccept the request to see their contact details. Accepting a qualified request costs {price}, charged to your wallet.' },
  { id: 'TL-NOTIF-LEAD-OFFER-001', channel: 'SMS', body: 'Toothlogy: new patient request for {treatment} near {area}. Open the app to accept.' },
  { id: 'TL-NOTIF-LEAD-ACCEPTED-001', channel: 'IN_APP', subject: 'Request accepted', body: '{practice} accepted your request and will contact you.' },
  { id: 'TL-NOTIF-LEAD-ACCEPTED-001', channel: 'EMAIL', subject: '{practice} accepted your request', body: '{practice} accepted your request and will contact you shortly.' },
  { id: 'TL-NOTIF-LEAD-ACCEPTED-001', channel: 'SMS', body: 'Toothlogy: {practice} accepted your request and will contact you.' },
  { id: 'TL-NOTIF-BILLING-UPDATE-001', channel: 'IN_APP', subject: 'Billing update', body: '{summary}' },
  { id: 'TL-NOTIF-BILLING-UPDATE-001', channel: 'EMAIL', subject: 'Toothlogy billing update', body: '{summary}\n\nSee your wallet and statements on your organization billing page.' },
  { id: 'TL-NOTIF-LEAD-BILLED-001', channel: 'IN_APP', subject: 'Lead billing', body: '{summary}' },
  { id: 'TL-NOTIF-LEAD-BILLED-001', channel: 'EMAIL', subject: 'Toothlogy lead billing', body: '{summary}\n\nSee every lead and charge on your leads page and wallet statement.' },
  { id: 'TL-NOTIF-WALLET-LOW-BALANCE-001', channel: 'IN_APP', subject: 'Wallet running low', body: 'Your lead wallet holds {balance}, enough for {leads} more paid leads. Recharge to keep receiving them without delay.' },
  { id: 'TL-NOTIF-WALLET-LOW-BALANCE-001', channel: 'EMAIL', subject: 'Your Toothlogy lead wallet is running low', body: 'Your lead wallet holds {balance}, enough for {leads} more paid leads.\n\nLeads that arrive when the wallet cannot cover them wait until it is recharged.' },
  { id: 'TL-NOTIF-ENROLMENT-001', channel: 'IN_APP', subject: 'Your enrolment', body: '{college}: {change} — {course}.' },
  { id: 'TL-NOTIF-ENROLMENT-001', channel: 'EMAIL', subject: 'Your enrolment on Toothlogy', body: '{college}: {change} — {course}. See it under My admissions.' },
  { id: 'TL-NOTIF-DEVICE-ALERT-001', channel: 'IN_APP', subject: 'Equipment alert', body: '{device}: {message}' },
  { id: 'TL-NOTIF-DEVICE-ALERT-001', channel: 'EMAIL', subject: 'Equipment alert on Toothlogy', body: '{device}: {message}. See it under Equipment on your organization page.' },
  { id: 'TL-NOTIF-APPLICATION-RECEIVED-001', channel: 'IN_APP', subject: 'New application', body: '{applicant} applied for “{title}”.' },
  { id: 'TL-NOTIF-APPLICATION-RECEIVED-001', channel: 'EMAIL', subject: 'New application on Toothlogy', body: '{applicant} applied for “{title}”. See it under Careers on your organization page.' },
  { id: 'TL-NOTIF-APPLICATION-UPDATE-001', channel: 'IN_APP', subject: 'Your application', body: 'Your application for “{title}” at {employer} {outcome}.' },
  { id: 'TL-NOTIF-APPLICATION-UPDATE-001', channel: 'EMAIL', subject: 'Your application on Toothlogy', body: 'Your application for “{title}” at {employer} {outcome}. See it under Applications in your account.' },
  { id: 'TL-NOTIF-ARTICLE-REVIEWED-001', channel: 'IN_APP', subject: 'Your article', body: '“{title}” {outcome}.' },
  { id: 'TL-NOTIF-RECORD-ACCESS-REQUEST-001', channel: 'IN_APP', subject: 'Access to your dental record', body: '{practice} asked to see your dental record. Nothing is shared unless you allow it.' },
  { id: 'TL-NOTIF-RECORD-ACCESS-REQUEST-001', channel: 'EMAIL', subject: 'A practice asked to see your dental record', body: '{practice} asked to see your dental record on Toothlogy. Nothing is shared unless you allow it — decide under Dental record in your account.' },
  { id: 'TL-NOTIF-RECORD-ACCESS-DECISION-001', channel: 'IN_APP', subject: 'Dental record access', body: '{patient} {decision}.' },
  { id: 'TL-NOTIF-RECORD-UPDATED-001', channel: 'IN_APP', subject: 'Your dental record', body: '{practice} {change}.' },
  { id: 'TL-NOTIF-TREATMENT-PLAN-001', channel: 'IN_APP', subject: 'Treatment plan', body: '{patient} {change} a treatment plan your practice proposed.' },
  { id: 'TL-NOTIF-PRESCRIPTION-ISSUED-001', channel: 'IN_APP', subject: 'New prescription', body: '{practice} issued you a prescription. Open it to print it or show it at a pharmacy.' },
  { id: 'TL-NOTIF-PRESCRIPTION-ISSUED-001', channel: 'EMAIL', subject: 'Your prescription', body: '{practice} issued you a prescription on Toothlogy. Open it under Dental record to print it or show it at a pharmacy.' },
  { id: 'TL-NOTIF-SUPPORT-UPDATE-001', channel: 'IN_APP', subject: 'Your support request', body: '{summary}' },
  { id: 'TL-NOTIF-SUPPORT-UPDATE-001', channel: 'EMAIL', subject: 'Your Toothlogy support request', body: '{summary}\n\nSee the conversation under Help on Toothlogy.' },
  { id: 'TL-NOTIF-REVIEW-RESPONSE-001', channel: 'IN_APP', subject: 'Reply to your review', body: '{summary}' },
  { id: 'TL-NOTIF-REVIEW-MODERATION-001', channel: 'IN_APP', subject: 'Your review was hidden', body: '{summary}' },
  { id: 'TL-NOTIF-FACULTY-REQUEST-001', channel: 'IN_APP', subject: 'Faculty post to confirm', body: '{summary}' },
  { id: 'TL-NOTIF-FACULTY-REQUEST-001', channel: 'EMAIL', subject: 'Faculty post to confirm on Toothlogy', body: '{summary}\n\nConfirm or decline it from your college’s faculty page on Toothlogy.' },
  { id: 'TL-NOTIF-FACULTY-DECISION-001', channel: 'IN_APP', subject: 'Your faculty post', body: '{summary}' },
  { id: 'TL-NOTIF-COMMUNITY-ANSWER-001', channel: 'IN_APP', subject: 'New answer', body: '{summary}' },
  { id: 'TL-NOTIF-COMMUNITY-MODERATION-001', channel: 'IN_APP', subject: 'Your post was hidden', body: '{summary}' },
  { id: 'TL-NOTIF-QUOTE-REQUEST-001', channel: 'IN_APP', subject: 'Quote request', body: '{summary}' },
  { id: 'TL-NOTIF-QUOTE-REQUEST-001', channel: 'EMAIL', subject: 'Quote request on Toothlogy', body: '{summary}\n\nSee the buyer’s details and answer from your quotes page on Toothlogy.' },
  { id: 'TL-NOTIF-QUOTE-UPDATE-001', channel: 'IN_APP', subject: 'Your quote request', body: '{summary}' },
  { id: 'TL-NOTIF-QUOTE-UPDATE-001', channel: 'EMAIL', subject: 'Your quote request on Toothlogy', body: '{summary}\n\nSee it under My quotes on Toothlogy.' },
  { id: 'TL-NOTIF-CAMP-REVIEW-001', channel: 'IN_APP', subject: 'Camp reviewed', body: '{summary}' },
  { id: 'TL-NOTIF-CAMP-APPLICATION-001', channel: 'IN_APP', subject: 'A doctor applied to your camp', body: '{summary}' },
  { id: 'TL-NOTIF-CAMP-PARTICIPATION-001', channel: 'IN_APP', subject: 'Your camp participation', body: '{summary}' },
  { id: 'TL-NOTIF-CAMP-UPDATE-001', channel: 'IN_APP', subject: 'Your dental camp', body: '{summary}' },
  { id: 'TL-NOTIF-ADMISSION-ENQUIRY-001', channel: 'IN_APP', subject: 'New admission enquiry', body: '{summary}' },
  { id: 'TL-NOTIF-ADMISSION-ENQUIRY-001', channel: 'EMAIL', subject: 'New admission enquiry on Toothlogy', body: '{summary}\n\nSee the student’s details and reply from your college’s admissions page on Toothlogy.' },
  { id: 'TL-NOTIF-ADMISSION-UPDATE-001', channel: 'IN_APP', subject: 'Your admission enquiry', body: '{summary}' },
  { id: 'TL-NOTIF-ADMISSION-UPDATE-001', channel: 'EMAIL', subject: 'Your admission enquiry on Toothlogy', body: '{summary}\n\nSee all your enquiries under My admissions on Toothlogy.' },
  { id: 'TL-NOTIF-LEAD-FOLLOW-UP-001', channel: 'IN_APP', subject: 'Follow-up due', body: '{summary}' },
  { id: 'TL-NOTIF-LEAD-ASSIGNED-001', channel: 'IN_APP', subject: 'Lead assigned to you', body: '{summary}' },
  { id: 'TL-NOTIF-ACCOUNT-ACTIVATION-001', channel: 'EMAIL', subject: 'Activate your Toothlogy profile', body: 'A Toothlogy profile was prepared for you from public dental records. To take it over, open this link and enter the code we sent to your mobile:\n\n{link}\n\nThe link works once and expires soon. If you did not ask for this, ignore this email — nothing changes.' },
  { id: 'TL-NOTIF-CAMPAIGN-UPDATE-001', channel: 'IN_APP', subject: 'Prime campaign', body: '{summary}' },
  { id: 'TL-NOTIF-CAMPAIGN-UPDATE-001', channel: 'EMAIL', subject: 'Your Toothlogy Prime campaign', body: '{summary}\n\nSee its results and spend on your campaigns page.' },
  { id: 'TL-NOTIF-PAYMENT-RECEIPT-001', channel: 'IN_APP', subject: 'Payment received', body: 'We received {amount} (reference {reference}).' },
  { id: 'TL-NOTIF-PAYMENT-RECEIPT-001', channel: 'EMAIL', subject: 'Payment receipt', body: 'We received your payment of {amount}.\n\nReference: {reference}\n\nYour wallet statement is on your billing page.' },

  // --- Later phases --------------------------------------------------------------
  { id: 'TL-NOTIF-REVIEW-RECEIVED-001', channel: 'IN_APP', subject: 'New review', body: 'A patient left a {rating}-star review. You can respond publicly.' },
  { id: 'TL-NOTIF-REVIEW-RECEIVED-001', channel: 'EMAIL', subject: 'You received a new review', body: 'A patient left a {rating}-star review after a completed visit.\n\nYou can respond publicly from your reviews page.' },
  { id: 'TL-NOTIF-NEW-MESSAGE-001', channel: 'IN_APP', subject: 'New message', body: 'New message from {sender}.' },
  { id: 'TL-NOTIF-ORDER-CONFIRMATION-001', channel: 'IN_APP', subject: 'Order placed', body: 'Order {orderNumber} for {total} was placed.' },
  { id: 'TL-NOTIF-ORDER-CONFIRMATION-001', channel: 'EMAIL', subject: 'Order {orderNumber} placed', body: 'Your order {orderNumber} for {total} was placed. You will be told as it ships.' },
  { id: 'TL-NOTIF-ORDER-CONFIRMATION-001', channel: 'SMS', body: 'Toothlogy: order {orderNumber} for {total} placed.' },
  { id: 'TL-NOTIF-ORDER-RECEIVED-001', channel: 'IN_APP', subject: 'Order activity', body: '{summary}' },
  { id: 'TL-NOTIF-ORDER-RECEIVED-001', channel: 'EMAIL', subject: 'Order activity on Toothlogy', body: '{summary}\n\nSee it under Orders on your organization page on Toothlogy.' },
  { id: 'TL-NOTIF-ORDER-UPDATE-001', channel: 'IN_APP', subject: 'Your order', body: 'Order {orderNumber} {change}.' },
  { id: 'TL-NOTIF-ORDER-UPDATE-001', channel: 'EMAIL', subject: 'Your order {orderNumber} on Toothlogy', body: 'Order {orderNumber} {change}.\n\nSee it under My orders on Toothlogy.' },
  { id: 'TL-NOTIF-SERVICE-CONTRACT-001', channel: 'IN_APP', subject: 'Maintenance contract', body: '{summary}' },
  { id: 'TL-NOTIF-SERVICE-CONTRACT-001', channel: 'EMAIL', subject: 'Maintenance contract on Toothlogy', body: '{summary}\n\nSee it under Equipment on your organization page on Toothlogy.' },
  { id: 'TL-NOTIF-EQUIPMENT-EXPIRY-001', channel: 'IN_APP', subject: 'Ending soon', body: '{summary}' },
  { id: 'TL-NOTIF-EQUIPMENT-EXPIRY-001', channel: 'EMAIL', subject: 'A warranty or maintenance contract is ending', body: '{summary}\n\nSee it under Equipment on your organization page on Toothlogy.' },
  { id: 'TL-NOTIF-MEMBERSHIP-001', channel: 'IN_APP', subject: 'Prime membership', body: '{summary}' },
  { id: 'TL-NOTIF-MEMBERSHIP-001', channel: 'EMAIL', subject: 'Your Toothlogy Prime membership', body: '{summary}\n\nSee it under Prime on your organization page on Toothlogy.' },
  { id: 'TL-NOTIF-ENTERPRISE-001', channel: 'IN_APP', subject: 'Enterprise agreement', body: '{summary}' },
  { id: 'TL-NOTIF-ENTERPRISE-001', channel: 'EMAIL', subject: 'Your Toothlogy enterprise agreement', body: '{summary}\n\nSee it on your organization page on Toothlogy.' },
];

async function seedNotificationTemplates(): Promise<number> {
  const known = new Set(NOTIFICATIONS.map((n) => n.id));
  let count = 0;

  for (const template of TEMPLATES) {
    if (!known.has(template.id)) {
      throw new Error(`Template for unregistered notification ${template.id}`);
    }
    await prisma.notificationTemplate.upsert({
      where: {
        notificationId_channel_locale: {
          notificationId: template.id,
          channel: template.channel,
          locale: 'en',
        },
      },
      create: {
        id: seedId('ntf', template.id, template.channel),
        notificationId: template.id,
        channel: template.channel,
        locale: 'en',
        subject: template.subject ?? null,
        body: template.body,
        isActive: true,
      },
      update: { subject: template.subject ?? null, body: template.body },
    });
    count += 1;
  }

  return count;
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

/**
 * Search synonyms: the words patients type, mapped to the words profiles use.
 *
 * Reference vocabulary, not content — each entry is a standard clinical term
 * or a common lay equivalent. Expansions are matched with the English stemmer,
 * so "fillings" and "filling" behave the same.
 */
const SYNONYMS: ReadonlyArray<{ term: string; expansions: string[] }> = [
  { term: 'rct', expansions: ['root canal treatment', 'endodontics'] },
  { term: 'root canal', expansions: ['root canal treatment', 'endodontics'] },
  { term: 'cleaning', expansions: ['scaling', 'polishing', 'prophylaxis'] },
  { term: 'scaling', expansions: ['cleaning', 'prophylaxis'] },
  { term: 'braces', expansions: ['orthodontics', 'orthodontist'] },
  { term: 'aligners', expansions: ['clear aligners', 'invisible braces', 'orthodontics'] },
  { term: 'invisalign', expansions: ['clear aligners', 'orthodontics'] },
  { term: 'cap', expansions: ['crown'] },
  { term: 'crown', expansions: ['cap', 'prosthodontics'] },
  { term: 'bridge', expansions: ['fixed partial denture', 'prosthodontics'] },
  { term: 'false teeth', expansions: ['dentures', 'prosthodontics'] },
  { term: 'dentures', expansions: ['false teeth', 'prosthodontics'] },
  { term: 'implant', expansions: ['dental implant', 'implantology', 'oral surgery'] },
  { term: 'extraction', expansions: ['tooth removal', 'oral surgery'] },
  { term: 'tooth removal', expansions: ['extraction', 'oral surgery'] },
  { term: 'wisdom tooth', expansions: ['third molar', 'extraction', 'oral surgery'] },
  { term: 'gum', expansions: ['periodontics', 'periodontist', 'gingival'] },
  { term: 'bleeding gums', expansions: ['gingivitis', 'periodontics'] },
  { term: 'kids', expansions: ['pediatric dentistry', 'paediatric dentistry', 'pedodontics'] },
  { term: 'children', expansions: ['pediatric dentistry', 'paediatric dentistry', 'pedodontics'] },
  { term: 'whitening', expansions: ['bleaching', 'cosmetic dentistry'] },
  { term: 'bleaching', expansions: ['whitening', 'cosmetic dentistry'] },
  { term: 'filling', expansions: ['restoration', 'cavity'] },
  { term: 'cavity', expansions: ['caries', 'filling', 'restoration'] },
  { term: 'toothache', expansions: ['tooth pain', 'emergency dentistry', 'endodontics'] },
  { term: 'tooth pain', expansions: ['toothache', 'emergency dentistry'] },
  { term: 'veneers', expansions: ['laminates', 'cosmetic dentistry'] },
  { term: 'smile makeover', expansions: ['cosmetic dentistry', 'veneers'] },
  { term: 'jaw surgery', expansions: ['maxillofacial surgery', 'orthognathic surgery'] },
  { term: 'x-ray', expansions: ['radiograph', 'opg', 'iopa'] },
  { term: 'opg', expansions: ['panoramic x-ray', 'orthopantomogram'] },
  { term: 'cbct', expansions: ['cone beam ct', '3d x-ray'] },
];

async function seedSearchSynonyms(): Promise<number> {
  for (const entry of SYNONYMS) {
    await prisma.searchSynonym.upsert({
      where: { locale_term: { locale: 'en', term: entry.term } },
      create: { id: seedId('syn', 'en', entry.term), locale: 'en', term: entry.term, expansions: entry.expansions },
      update: { expansions: entry.expansions },
    });
  }
  return SYNONYMS.length;
}

/**
 * The treatment catalogue. Reference content maintained in
 * src/platform/catalogue/treatments.ts; clinics reference these rows and set
 * their own prices. Updated in place on re-seed so wording fixes propagate,
 * but a treatment is never deleted here — offerings reference it.
 */
async function seedTreatments(): Promise<number> {
  let order = 0;
  for (const t of TREATMENTS) {
    order += 10;
    const data = {
      name: t.name,
      category: t.category,
      specialtyKey: t.specialtyKey ?? null,
      description: t.description,
      typicalDurationMinutes: t.typicalDurationMinutes,
      preparation: t.preparation ?? null,
      aftercare: t.aftercare ?? null,
      eligibility: t.eligibility ?? null,
      isEmergencyEligible: t.isEmergencyEligible ?? false,
      sortOrder: order,
      isActive: true,
    };
    await prisma.treatment.upsert({
      where: { key: t.key },
      create: { id: seedId('trt', t.key), key: t.key, ...data },
      update: data,
    });
  }
  return TREATMENTS.length;
}

/**
 * Lead qualification and pricing for India.
 *
 * Configuration, not code: the price and the definition of a qualified lead
 * are rows, so changing them is an insert with an effective date — never a
 * deploy, and never a rewrite of what past leads were charged. This is the
 * one place the default ₹90 appears.
 *
 * Existing rows are left alone: an operator's later change must survive a
 * re-seed.
 */
async function seedLeadConfiguration(): Promise<{ rules: number; prices: number }> {
  const effectiveFrom = new Date('2026-01-01T00:00:00Z');
  await prisma.leadQualificationRule.upsert({
    where: { countryCode_version: { countryCode: 'IN', version: 1 } },
    update: {},
    create: {
      id: seedId('lqr', 'in', '1'),
      countryCode: 'IN',
      version: 1,
      isActive: true,
      effectiveFrom,
      criteria: {
        // A lead is only billable when the patient's contact is verified…
        requireVerifiedContact: true,
        // …and, for bookings, only once the practice has confirmed it.
        qualifyBookingOn: 'CONFIRMED',
        // "Please call me" requests qualify when created (they are the lead).
        qualifyCallbacks: true,
        // The same patient, practice and service within this window is one lead.
        dedupeWindowDays: 30,
      },
    },
  });

  // The launch rule (₹90 a lead). Kept for the history of what was charged
  // under it; superseded below.
  const launchId = seedId('lpr', 'in', 'default');
  const launch = await prisma.leadPricingRule.findUnique({ where: { id: launchId } });
  if (!launch) {
    await prisma.leadPricingRule.create({
      data: {
        id: launchId,
        countryCode: 'IN',
        currency: 'INR',
        priceMinor: BigInt(9000), // ₹90.00, before GST on platform fees
        taxCategory: 'platform_fees',
        taxInclusive: false,
        isActive: true,
        effectiveFrom,
      },
    });
  }

  // Business decision of 2026-09-10: an organization's first 30 qualified
  // leads are free; from the 31st, ₹50 each plus GST; recharges start at 20
  // paid leads; a warning when the wallet covers fewer than 3.
  const tieredFrom = new Date('2026-09-10T00:00:00Z');
  await prisma.leadPricingRule.updateMany({ where: { id: launchId, effectiveTo: null }, data: { effectiveTo: tieredFrom } });
  const tieredId = seedId('lpr', 'in', '2026-09-tiered');
  const tiered = await prisma.leadPricingRule.findUnique({ where: { id: tieredId } });
  if (!tiered) {
    await prisma.leadPricingRule.create({
      data: {
        id: tieredId,
        countryCode: 'IN',
        currency: 'INR',
        priceMinor: BigInt(5000), // ₹50.00 per paid lead, before GST on platform fees
        taxCategory: 'platform_fees',
        taxInclusive: false,
        freeLeadAllowance: 30,
        minimumRechargeLeads: 20,
        lowBalanceLeads: 3,
        isActive: true,
        effectiveFrom: tieredFrom,
      },
    });
  }
  // Sponsored placement limits for India: configuration, confirmable by the
  // business at any time without a deploy. The minimum daily budget is a
  // floor, not a price — the practice chooses its own budget above it.
  await prisma.sponsoredPlacementSettings.upsert({
    where: { countryCode: 'IN' },
    update: {},
    create: {
      id: seedId('sps', 'in'),
      countryCode: 'IN',
      currency: 'INR',
      minimumDailyBudgetMinor: BigInt(10000), // ₹100 a day, GST included
      searchSlots: 2,
      profileSlots: 1,
      maxCampaignDays: 365,
      taxCategory: 'platform_fees',
    },
  });
  return { rules: 1, prices: 2 };
}

/**
 * Chhattisgarh's 33 districts (after the 2022 reorganisation), with the
 * alternative spellings seen in directory data. The national list is loaded
 * from the official Local Government Directory export with
 * `scripts/import-districts.mts`; LGD codes arrive with it. Existing rows are
 * left alone, so a re-seed never undoes an import.
 */
const CHHATTISGARH_DISTRICTS: ReadonlyArray<{ name: string; aliases?: string[] }> = [
  { name: 'Balod' },
  { name: 'Baloda Bazar-Bhatapara', aliases: ['Baloda Bazar', 'Balodabazar'] },
  { name: 'Balrampur-Ramanujganj', aliases: ['Balrampur'] },
  { name: 'Bastar', aliases: ['Jagdalpur'] },
  { name: 'Bemetara' },
  { name: 'Bijapur' },
  { name: 'Bilaspur' },
  { name: 'Dantewada', aliases: ['Dakshin Bastar Dantewada'] },
  { name: 'Dhamtari' },
  { name: 'Durg' },
  { name: 'Gariaband' },
  { name: 'Gaurela-Pendra-Marwahi', aliases: ['GPM'] },
  { name: 'Janjgir-Champa' },
  { name: 'Jashpur' },
  { name: 'Kabirdham', aliases: ['Kawardha'] },
  { name: 'Kanker', aliases: ['Uttar Bastar Kanker'] },
  { name: 'Khairagarh-Chhuikhadan-Gandai' },
  { name: 'Kondagaon' },
  { name: 'Korba' },
  { name: 'Koriya', aliases: ['Korea'] },
  { name: 'Mahasamund' },
  { name: 'Manendragarh-Chirmiri-Bharatpur' },
  { name: 'Mohla-Manpur-Ambagarh Chowki' },
  { name: 'Mungeli' },
  { name: 'Narayanpur' },
  { name: 'Raigarh' },
  { name: 'Raipur' },
  { name: 'Rajnandgaon' },
  { name: 'Sakti' },
  { name: 'Sarangarh-Bilaigarh' },
  { name: 'Sukma' },
  { name: 'Surajpur' },
  { name: 'Surguja', aliases: ['Ambikapur'] },
];

async function seedDistricts(): Promise<number> {
  const region = await prisma.region.findUnique({ where: { countryCode_name: { countryCode: 'IN', name: 'Chhattisgarh' } } });
  if (!region) return 0;
  const slug = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  for (const district of CHHATTISGARH_DISTRICTS) {
    const existing = await prisma.district.findUnique({ where: { regionId_slug: { regionId: region.id, slug: slug(district.name) } } });
    const row = existing ?? (await prisma.district.create({
      data: { id: seedId('dst', 'cg', slug(district.name)), countryCode: 'IN', regionId: region.id, name: district.name, slug: slug(district.name), aliases: district.aliases ?? [] },
    }));
    // A seeded city of the same name lies in the district of that name.
    await prisma.city.updateMany({ where: { regionId: region.id, name: district.name, districtId: null }, data: { districtId: row.id } });
  }
  return CHHATTISGARH_DISTRICTS.length;
}

async function main(): Promise<void> {
  console.log('Seeding Toothlogy reference data...\n');

  const countries = await seedCountries();
  console.log(`  countries              ${countries}`);

  const geography = await seedIndianGeography();
  console.log(`  regions (IN)           ${geography.regions}`);
  console.log(`  cities (IN)            ${geography.cities}`);

  const districts = await seedDistricts();
  console.log(`  districts (IN, CG)     ${districts}`);

  const tax = await seedTaxConfiguration();
  console.log(`  tax configurations     ${tax}`);

  const holidays = await seedHolidays();
  console.log(`  holidays (IN)          ${holidays}`);

  const templates = await seedNotificationTemplates();
  console.log(`  notification templates ${templates}`);

  const specialties = await seedSpecialties();
  console.log(`  dental specialties     ${specialties}`);

  const synonyms = await seedSearchSynonyms();
  console.log(`  search synonyms        ${synonyms}`);

  const treatments = await seedTreatments();
  console.log(`  treatments             ${treatments}`);

  const leads = await seedLeadConfiguration();
  console.log(`  lead rules / prices    ${leads.rules} / ${leads.prices}`);

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

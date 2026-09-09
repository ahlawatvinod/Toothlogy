/**
 * TOOTHLOGY DENTAL SPECIALTIES — canonical reference list
 *
 * The recognised dental specialties, defined once.
 *
 * WHY THIS IS NOT JUST A DATABASE TABLE
 * It is a database table — `Specialty`, seeded from this array and served by
 * `GET /api/v1/specialties`. But a public marketing page that lists them should
 * not open a database connection to render, and a second hand-typed copy in a
 * component is how "Paediatric dentistry" ends up spelled two ways in one
 * product. So the list lives here, the seed upserts from it, and any surface
 * that needs the names without a query imports it directly. There is one place
 * to add a specialty, and it reaches the database and the site together.
 *
 * `key` is the stable identifier and is never renamed — it is what a dentist's
 * profile and, later, a discovery filter are stored against. `name` and
 * `description` are display strings and may be revised.
 *
 * DESCRIPTIONS ARE WRITTEN FOR PATIENTS, NOT CLINICIANS
 * "Endodontics" means nothing to most people, and a search filter nobody
 * understands is a filter nobody uses — which pushes patients toward general
 * practitioners for problems that need a specialist.
 *
 * NO UI IMPORTS
 * This module is loaded by `prisma/seed.mts` under Node's type stripping, which
 * resolves neither the `@/` alias nor `.tsx`. It also sits in the platform
 * layer, which does not depend on the design system. Icon choices therefore
 * live with the component that renders them, not here.
 */

export interface DentalSpecialty {
  readonly key: string;
  readonly name: string;
  readonly description: string;
}

export const DENTAL_SPECIALTIES: readonly DentalSpecialty[] = [
  {
    key: 'general_dentistry',
    name: 'General dentistry',
    description: 'Routine check-ups, fillings, cleaning and everyday dental care.',
  },
  {
    key: 'endodontics',
    name: 'Endodontics (root canal)',
    description:
      'Treatment of the nerve and pulp inside a tooth, including root canal therapy.',
  },
  {
    key: 'orthodontics',
    name: 'Orthodontics (braces and aligners)',
    description: 'Straightening teeth and correcting bite problems with braces or aligners.',
  },
  {
    key: 'periodontics',
    name: 'Periodontics (gums)',
    description: 'Treatment of gum disease and the bone supporting your teeth.',
  },
  {
    key: 'prosthodontics',
    name: 'Prosthodontics (crowns and dentures)',
    description:
      'Replacing missing or damaged teeth with crowns, bridges, dentures or implants.',
  },
  {
    key: 'oral_surgery',
    name: 'Oral and maxillofacial surgery',
    description: 'Surgical procedures including extractions, wisdom teeth and jaw surgery.',
  },
  {
    key: 'pedodontics',
    name: 'Paediatric dentistry',
    description: 'Dental care for children, from first teeth through the teenage years.',
  },
  {
    key: 'oral_pathology',
    name: 'Oral pathology and medicine',
    description: 'Diagnosis of diseases affecting the mouth, jaws and surrounding tissues.',
  },
  {
    key: 'oral_radiology',
    name: 'Oral radiology',
    description: 'Dental imaging, including X-rays, OPG and CBCT scans.',
  },
  {
    key: 'public_health_dentistry',
    name: 'Public health dentistry',
    description: 'Community dental health, prevention programmes and population oral care.',
  },
  {
    key: 'implantology',
    name: 'Implantology',
    description: 'Replacing missing teeth with surgically placed dental implants.',
  },
  {
    key: 'cosmetic_dentistry',
    name: 'Cosmetic dentistry',
    description: 'Improving the appearance of teeth: whitening, veneers and reshaping.',
  },
] as const;

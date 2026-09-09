/**
 * TOOTHLOGY MASTER TREATMENT CATALOGUE — canonical seed data
 *
 * The 17 categories and every treatment in them, with the suggested Indian
 * price range for each.
 *
 * WHAT A SUGGESTED RANGE IS, AND IS NOT
 * It is a market reference: roughly what this treatment costs in India today.
 * It is NOT a quote, and it is NOT any particular clinic's price. Nothing in
 * the platform may render it as though a dentist had agreed to it — see
 * `pricing/display.ts`, which labels it "Suggested range" and never anything
 * else (specification §13, Constitution P9).
 *
 * PRICES ARE WRITTEN IN RUPEES HERE
 * The rest of the platform works in minor units, and these are converted to
 * paise on the way in. Rupees are used in this file alone because it is a
 * transcription of a source document written in rupees, and `1500` is
 * checkable against that document at a glance where `150000` is not.
 *
 * THREE DECISIONS WORTH KNOWING ABOUT (specification §25)
 *
 * 1. **One canonical record per treatment.** Emergency Consultation belongs in
 *    both Consultation & Diagnosis and Emergency Dentistry. Rather than two
 *    records that drift apart in price and description, there is one, with
 *    `alsoIn` listing its other contexts. The same applies to fluoride, which
 *    the source lists under both Preventive and Paediatric.
 *
 * 2. **Where the source lists rows that are plainly variants of one treatment,
 *    they are variants.** "Anterior RCT", "Premolar RCT" and "Molar RCT" are
 *    one procedure priced by tooth position, not three procedures, and §2 of
 *    the specification asks for exactly this shape. Each variant keeps its own
 *    range, so no figure from the source is lost.
 *
 * 3. **Where a row is genuinely a different procedure, it stays its own
 *    service** even if §2 lists it as a variant elsewhere. Bone grafting and a
 *    sinus lift are separate operations that happen to accompany an implant;
 *    modelling them as implant variants would make them unfindable for the
 *    patients who need them on their own.
 *
 * Anything listed in the source as "₹X–₹Y+" sets `openEnded`, which preserves
 * both figures and renders the "+".
 */

export interface CatalogueVariantSeed {
  readonly slug: string;
  readonly name: string;
  /** Suggested range in whole rupees. Omitted where the variant has no range. */
  readonly min?: number;
  readonly max?: number;
  readonly openEnded?: boolean;
  readonly customQuote?: boolean;
  readonly description?: string;
}

export interface CatalogueServiceSeed {
  readonly slug: string;
  readonly name: string;
  /** Key from PRICE_UNITS. */
  readonly unit: string;
  readonly min?: number;
  readonly max?: number;
  readonly openEnded?: boolean;
  readonly customQuote?: boolean;
  readonly isPackage?: boolean;
  readonly patientDescription?: string;
  /** Additional category slugs this treatment also appears under. */
  readonly alsoIn?: readonly string[];
  /** Terms patients actually search for. See `search.ts`. */
  readonly synonyms?: readonly string[];
  readonly variants?: readonly CatalogueVariantSeed[];
}

export interface CatalogueCategorySeed {
  readonly slug: string;
  readonly name: string;
  readonly patientDescription?: string;
  readonly services: readonly CatalogueServiceSeed[];
}

export const CATALOGUE_CURRENCY = 'INR';

export const CATALOGUE: readonly CatalogueCategorySeed[] = [
  {
    slug: 'consultation-diagnosis',
    name: 'Consultation & Diagnosis',
    patientDescription: 'Getting your problem looked at and understood.',
    services: [
      {
        slug: 'dental-consultation',
        name: 'Dental Consultation',
        unit: 'per_visit',
        min: 300,
        max: 1500,
        patientDescription: 'A dentist examines you and explains what is going on.',
        synonyms: ['consultation', 'checkup', 'check up', 'dentist visit', 'opinion'],
      },
      {
        slug: 'specialist-consultation',
        name: 'Specialist Consultation',
        unit: 'per_visit',
        min: 500,
        max: 2000,
        synonyms: ['specialist', 'specialist opinion'],
      },
      {
        slug: 'second-opinion',
        name: 'Second Opinion',
        unit: 'per_visit',
        min: 500,
        max: 2000,
        patientDescription: 'A second dentist reviews a treatment plan you already have.',
        synonyms: ['second opinion', 'review treatment plan'],
      },
      {
        // Canonical here; also listed under Emergency Dentistry. See note 1.
        slug: 'emergency-consultation',
        name: 'Emergency Consultation',
        unit: 'per_visit',
        min: 500,
        max: 2000,
        alsoIn: ['emergency-dentistry'],
        synonyms: ['emergency', 'urgent', 'pain', 'toothache', 'out of hours'],
      },
      {
        slug: 'dental-examination',
        name: 'Dental Examination',
        unit: 'per_visit',
        min: 300,
        max: 800,
        synonyms: ['examination', 'oral examination', 'screening'],
      },
    ],
  },

  {
    slug: 'xray-diagnostics',
    name: 'X-Ray & Diagnostics',
    patientDescription: 'Imaging that shows what an examination alone cannot.',
    services: [
      {
        slug: 'iopa-xray',
        name: 'IOPA X-Ray',
        unit: 'per_procedure',
        min: 200,
        max: 500,
        patientDescription: 'A small X-ray of one or two teeth.',
        synonyms: ['xray', 'x ray', 'x-ray', 'iopa', 'rvg', 'radiograph'],
      },
      {
        slug: 'opg',
        name: 'OPG',
        unit: 'per_procedure',
        min: 500,
        max: 1200,
        patientDescription: 'A single X-ray showing all your teeth and both jaws.',
        synonyms: ['opg', 'panoramic', 'orthopantomogram', 'full mouth xray'],
      },
      {
        slug: 'cbct',
        name: 'CBCT',
        unit: 'per_procedure',
        min: 1500,
        max: 5000,
        patientDescription: 'A 3D scan, usually before implants or difficult surgery.',
        synonyms: ['cbct', '3d scan', 'cone beam', 'ct scan'],
      },
      {
        slug: 'digital-smile-design-analysis',
        name: 'Digital Smile / Design Analysis',
        unit: 'per_case',
        min: 1000,
        max: 5000,
        synonyms: ['dsd', 'smile design', 'digital smile design', 'smile analysis'],
      },
    ],
  },

  {
    slug: 'preventive-dentistry',
    name: 'Preventive Dentistry',
    patientDescription: 'Keeping problems from starting.',
    services: [
      {
        slug: 'oral-prophylaxis-scaling',
        name: 'Oral Prophylaxis / Scaling',
        unit: 'per_visit',
        min: 800,
        max: 2500,
        patientDescription: 'Professional cleaning to remove plaque and tartar.',
        synonyms: [
          'scaling',
          'cleaning',
          'teeth cleaning',
          'tooth cleaning',
          'polishing',
          'prophylaxis',
          'descaling',
        ],
      },
      {
        // Canonical here; the source also lists it under Paediatric Dentistry
        // as "Fluoride Treatment" at the same price. One record, two contexts.
        slug: 'fluoride-application',
        name: 'Fluoride Application',
        unit: 'per_visit',
        min: 500,
        max: 1500,
        alsoIn: ['pediatric-dentistry'],
        synonyms: ['fluoride', 'fluoride treatment', 'fluoride varnish'],
      },
      {
        slug: 'pit-fissure-sealant',
        name: 'Pit & Fissure Sealant',
        unit: 'per_tooth',
        min: 500,
        max: 1500,
        alsoIn: ['pediatric-dentistry'],
        synonyms: ['sealant', 'fissure sealant', 'pit and fissure'],
      },
      {
        slug: 'desensitization',
        name: 'Desensitization',
        unit: 'per_visit',
        min: 500,
        max: 1500,
        patientDescription: 'Treatment for teeth that hurt with cold or sweet things.',
        synonyms: ['sensitivity', 'sensitive teeth', 'desensitisation'],
      },
    ],
  },

  {
    slug: 'restorative-dentistry',
    name: 'Restorative Dentistry',
    patientDescription: 'Repairing damaged or decayed teeth.',
    services: [
      {
        slug: 'tooth-coloured-filling',
        name: 'Tooth-Coloured Filling',
        unit: 'per_tooth',
        min: 800,
        max: 2500,
        synonyms: ['filling', 'cavity', 'tooth colored filling', 'white filling'],
      },
      {
        slug: 'gic-filling',
        name: 'GIC Filling',
        unit: 'per_tooth',
        min: 500,
        max: 1500,
        synonyms: ['gic', 'glass ionomer', 'cement filling'],
      },
      {
        slug: 'composite-restoration',
        name: 'Composite Restoration',
        unit: 'per_tooth',
        min: 1000,
        max: 3000,
        synonyms: ['composite', 'bonding', 'tooth bonding'],
      },
      {
        slug: 'inlay-onlay',
        name: 'Inlay / Onlay',
        unit: 'per_tooth',
        min: 4000,
        max: 15000,
        synonyms: ['inlay', 'onlay'],
      },
    ],
  },

  {
    slug: 'root-canal-treatment',
    name: 'Root Canal Treatment',
    patientDescription: 'Treating infection inside a tooth so it can be kept.',
    services: [
      {
        // One procedure priced by tooth position. See note 2.
        slug: 'root-canal-treatment',
        name: 'Root Canal Treatment',
        unit: 'per_tooth',
        min: 3000,
        max: 18000,
        patientDescription:
          'Cleaning out the infected nerve inside a tooth and sealing it, so the tooth can stay rather than being removed.',
        synonyms: ['rct', 'root canal', 'root canal treatment', 'nerve treatment', 'endodontic'],
        variants: [
          { slug: 'anterior', name: 'Anterior', min: 3000, max: 7000 },
          { slug: 'premolar', name: 'Premolar', min: 4000, max: 9000 },
          { slug: 'molar', name: 'Molar', min: 5000, max: 12000 },
          {
            slug: 're-rct',
            name: 'Re-RCT',
            min: 7000,
            max: 18000,
            description: 'Redoing a root canal that has failed.',
          },
          { slug: 'single-visit', name: 'Single Visit' },
          { slug: 'multiple-visit', name: 'Multiple Visit' },
        ],
      },
      {
        slug: 'rct-crown-package',
        name: 'RCT + Crown Package',
        unit: 'package',
        min: 8000,
        max: 25000,
        isPackage: true,
        patientDescription: 'Root canal and the crown that protects the tooth afterwards.',
        synonyms: ['rct crown', 'root canal with crown', 'rct package'],
      },
    ],
  },

  {
    slug: 'crowns-bridges',
    name: 'Crowns & Bridges',
    patientDescription: 'Covering a damaged tooth, or replacing a missing one.',
    services: [
      {
        // "Temporary Crown" lives here as a variant rather than as a separate
        // service under laboratory charges: it is a crown, and a patient
        // comparing crowns should see it beside the others. Reachable by
        // search through the synonym below.
        slug: 'crown',
        name: 'Crown',
        unit: 'per_crown',
        // Spans every variant below, including the temporary crown at ₹1,000.
        // A service range that does not cover its own variants makes the
        // summary line on a category page contradict the detail beneath it.
        min: 1000,
        max: 20000,
        patientDescription: 'A cap fitted over a tooth to protect and rebuild it.',
        synonyms: ['crown', 'cap', 'tooth cap', 'capping', 'temporary crown', 'zirconia'],
        variants: [
          { slug: 'metal', name: 'Metal', min: 2500, max: 6000 },
          { slug: 'pfm', name: 'PFM', min: 4000, max: 8000 },
          { slug: 'zirconia', name: 'Zirconia', min: 8000, max: 18000 },
          { slug: 'e-max', name: 'E-Max', min: 10000, max: 20000 },
          { slug: 'full-ceramic', name: 'Full Ceramic' },
          { slug: 'temporary', name: 'Temporary', min: 1000, max: 3000 },
          { slug: 'premium-zirconia', name: 'Premium Zirconia' },
          { slug: 'other', name: 'Other' },
        ],
      },
      {
        slug: 'dental-bridge',
        name: 'Dental Bridge',
        unit: 'per_unit',
        min: 10000,
        max: 40000,
        openEnded: true,
        patientDescription: 'Replaces a missing tooth by anchoring to the teeth either side.',
        synonyms: ['bridge', 'dental bridge', 'fixed bridge'],
      },
    ],
  },

  {
    slug: 'extractions-oral-surgery',
    name: 'Extractions & Oral Surgery',
    patientDescription: 'Removing a tooth that cannot be saved.',
    services: [
      {
        slug: 'simple-extraction',
        name: 'Simple Extraction',
        unit: 'per_tooth',
        min: 800,
        max: 2500,
        synonyms: ['extraction', 'tooth removal', 'pull tooth', 'remove tooth'],
      },
      {
        slug: 'surgical-extraction',
        name: 'Surgical Extraction',
        unit: 'per_tooth',
        min: 2000,
        max: 6000,
        synonyms: ['surgical extraction'],
      },
      {
        slug: 'wisdom-tooth-extraction',
        name: 'Wisdom Tooth Extraction',
        unit: 'per_tooth',
        min: 3000,
        max: 10000,
        synonyms: ['wisdom tooth', 'wisdom teeth', 'third molar'],
      },
      {
        slug: 'impacted-wisdom-tooth-surgery',
        name: 'Impacted Wisdom Tooth Surgery',
        unit: 'per_tooth',
        min: 5000,
        max: 15000,
        openEnded: true,
        synonyms: ['impacted wisdom tooth', 'impacted tooth surgery'],
      },
    ],
  },

  {
    slug: 'prosthodontics-dentures',
    name: 'Prosthodontics / Dentures',
    patientDescription: 'Replacing several missing teeth, or a whole jaw of them.',
    services: [
      {
        slug: 'denture',
        name: 'Denture',
        unit: 'per_arch',
        min: 5000,
        max: 150000,
        openEnded: true,
        patientDescription: 'A removable replacement for missing teeth.',
        synonyms: ['denture', 'dentures', 'false teeth', 'artificial teeth'],
        variants: [
          { slug: 'complete', name: 'Complete', min: 8000, max: 30000 },
          { slug: 'partial', name: 'Partial', min: 5000, max: 25000 },
          { slug: 'flexible', name: 'Flexible', min: 8000, max: 20000 },
          { slug: 'acrylic', name: 'Acrylic' },
          { slug: 'metal-framework', name: 'Metal Framework' },
          {
            slug: 'implant-supported',
            name: 'Implant-Supported',
            min: 50000,
            max: 150000,
            openEnded: true,
          },
          { slug: 'premium', name: 'Premium' },
          { slug: 'economy', name: 'Economy' },
        ],
      },
    ],
  },

  {
    slug: 'dental-implants',
    name: 'Dental Implants',
    patientDescription: 'A permanent replacement rooted in the jaw.',
    services: [
      {
        slug: 'dental-implant',
        name: 'Dental Implant',
        unit: 'per_implant',
        min: 20000,
        max: 80000,
        openEnded: true,
        patientDescription:
          'A titanium post placed in the jaw, which a crown is later fitted to.',
        synonyms: ['implant', 'dental implant', 'tooth implant', 'implants'],
        variants: [
          { slug: 'placement-only', name: 'Implant Placement Only', min: 20000, max: 50000 },
          { slug: 'implant-abutment', name: 'Implant + Abutment' },
          { slug: 'implant-crown', name: 'Implant + Crown' },
          {
            slug: 'implant-abutment-crown',
            name: 'Implant + Abutment + Crown',
            min: 35000,
            max: 80000,
            openEnded: true,
          },
          { slug: 'standard-implant', name: 'Standard Implant' },
          { slug: 'premium-implant', name: 'Premium Implant' },
        ],
      },
      {
        // A separate operation, not an implant variant. See note 3.
        slug: 'bone-grafting',
        name: 'Bone Grafting',
        unit: 'per_procedure',
        min: 10000,
        max: 40000,
        openEnded: true,
        synonyms: ['bone graft', 'bone grafting', 'graft'],
      },
      {
        slug: 'sinus-lift',
        name: 'Sinus Lift',
        unit: 'per_procedure',
        min: 20000,
        max: 60000,
        openEnded: true,
        synonyms: ['sinus lift', 'sinus augmentation'],
      },
    ],
  },

  {
    slug: 'orthodontics',
    name: 'Orthodontics',
    patientDescription: 'Straightening teeth and correcting the bite.',
    services: [
      {
        slug: 'braces',
        name: 'Braces',
        unit: 'per_case',
        min: 25000,
        max: 80000,
        patientDescription: 'Fixed appliances that move teeth into position over months.',
        synonyms: ['braces', 'brackets', 'wire braces', 'teeth straightening'],
        variants: [
          { slug: 'metal', name: 'Metal', min: 25000, max: 50000 },
          { slug: 'ceramic', name: 'Ceramic', min: 35000, max: 70000 },
          { slug: 'self-ligating', name: 'Self-Ligating', min: 40000, max: 80000 },
          { slug: 'lingual', name: 'Lingual' },
          { slug: 'other', name: 'Other' },
        ],
      },
      {
        slug: 'clear-aligners',
        name: 'Clear Aligners',
        unit: 'per_case',
        min: 50000,
        max: 200000,
        openEnded: true,
        patientDescription: 'Removable transparent trays, changed every few weeks.',
        synonyms: ['aligners', 'clear aligners', 'invisible braces', 'invisalign'],
        variants: [
          { slug: 'basic', name: 'Basic' },
          { slug: 'standard', name: 'Standard' },
          { slug: 'premium', name: 'Premium' },
          { slug: 'full-case', name: 'Full Case' },
          { slug: 'limited-case', name: 'Limited Case' },
          { slug: 'refinement', name: 'Refinement' },
        ],
      },
      {
        slug: 'retainers',
        name: 'Retainers',
        unit: 'per_appliance',
        min: 2000,
        max: 10000,
        patientDescription: 'Worn after treatment to stop teeth drifting back.',
        synonyms: ['retainer', 'retainers'],
      },
    ],
  },

  {
    slug: 'cosmetic-dentistry',
    name: 'Cosmetic Dentistry',
    patientDescription: 'Changing how your teeth look.',
    services: [
      {
        slug: 'teeth-whitening',
        name: 'Teeth Whitening',
        unit: 'per_session',
        min: 5000,
        max: 15000,
        synonyms: ['whitening', 'bleaching', 'teeth whitening', 'teeth bleaching'],
      },
      {
        slug: 'composite-veneer',
        name: 'Composite Veneer',
        unit: 'per_tooth',
        min: 2000,
        max: 6000,
        synonyms: ['veneer', 'composite veneer'],
      },
      {
        slug: 'porcelain-emax-veneer',
        name: 'Porcelain / E-Max Veneer',
        unit: 'per_tooth',
        min: 8000,
        max: 20000,
        synonyms: ['porcelain veneer', 'emax veneer', 'e-max veneer', 'laminates'],
      },
      {
        slug: 'smile-makeover',
        name: 'Smile Makeover',
        unit: 'per_case',
        min: 50000,
        max: 300000,
        openEnded: true,
        synonyms: ['smile makeover', 'full smile', 'hollywood smile'],
      },
    ],
  },

  {
    slug: 'pediatric-dentistry',
    name: 'Pediatric Dentistry',
    patientDescription: 'Dental care for children.',
    services: [
      {
        slug: 'child-consultation',
        name: 'Child Consultation',
        unit: 'per_visit',
        min: 300,
        max: 1000,
        synonyms: ['child consultation', 'kids dentist', 'paediatric consultation'],
      },
      {
        slug: 'pulpotomy',
        name: 'Pulpotomy',
        unit: 'per_tooth',
        min: 2000,
        max: 5000,
        patientDescription: 'A root canal for a baby tooth.',
        synonyms: ['pulpotomy', 'baby tooth root canal'],
      },
      {
        slug: 'stainless-steel-crown',
        name: 'Stainless-Steel Crown',
        unit: 'per_crown',
        min: 2000,
        max: 5000,
        synonyms: ['stainless steel crown', 'ssc', 'metal cap child'],
      },
      {
        slug: 'space-maintainer',
        name: 'Space Maintainer',
        unit: 'per_appliance',
        min: 2000,
        max: 6000,
        patientDescription: 'Holds the gap open when a baby tooth is lost too early.',
        synonyms: ['space maintainer'],
      },
    ],
  },

  {
    slug: 'periodontics',
    name: 'Periodontics / Gum Treatment',
    patientDescription: 'Treating the gums and bone that hold teeth in place.',
    services: [
      {
        slug: 'deep-cleaning',
        name: 'Deep Cleaning',
        unit: 'per_visit',
        min: 1500,
        max: 5000,
        patientDescription: 'Cleaning below the gum line, where ordinary scaling cannot reach.',
        synonyms: ['deep cleaning', 'srp', 'teeth cleaning', 'gum cleaning', 'curettage'],
      },
      {
        slug: 'root-planing',
        name: 'Root Planing',
        unit: 'per_quadrant',
        min: 1000,
        max: 3000,
        synonyms: ['root planing', 'planing', 'srp'],
      },
      {
        slug: 'gum-surgery',
        name: 'Gum Surgery',
        unit: 'per_quadrant',
        min: 5000,
        max: 20000,
        openEnded: true,
        synonyms: ['gum surgery', 'gingival surgery'],
      },
      {
        slug: 'periodontal-flap-surgery',
        name: 'Periodontal Flap Surgery',
        unit: 'per_quadrant',
        min: 5000,
        max: 15000,
        synonyms: ['flap surgery', 'periodontal surgery'],
      },
    ],
  },

  {
    slug: 'oral-maxillofacial-surgery',
    name: 'Oral & Maxillofacial Surgery',
    patientDescription: 'Surgery of the mouth, jaws and face.',
    services: [
      {
        slug: 'biopsy',
        name: 'Biopsy',
        unit: 'per_procedure',
        min: 3000,
        max: 10000,
        synonyms: ['biopsy', 'tissue test'],
      },
      {
        slug: 'cyst-removal',
        name: 'Cyst Removal',
        unit: 'per_procedure',
        min: 10000,
        max: 40000,
        openEnded: true,
        synonyms: ['cyst', 'cyst removal'],
      },
      {
        slug: 'minor-oral-surgery',
        name: 'Minor Oral Surgery',
        unit: 'per_procedure',
        min: 5000,
        max: 20000,
        synonyms: ['minor surgery', 'oral surgery'],
      },
    ],
  },

  {
    slug: 'emergency-dentistry',
    name: 'Emergency Dentistry',
    patientDescription: 'Same-day care when something is badly wrong.',
    services: [
      {
        slug: 'emergency-dressing',
        name: 'Emergency Dressing',
        unit: 'per_visit',
        min: 500,
        max: 1500,
        patientDescription: 'A temporary dressing to settle pain until proper treatment.',
        synonyms: ['dressing', 'temporary filling', 'emergency dressing'],
      },
      {
        slug: 'emergency-rct',
        name: 'Emergency RCT',
        unit: 'per_session',
        min: 1000,
        max: 3000,
        patientDescription: 'Opening a tooth to relieve severe pain, completed later.',
        synonyms: ['emergency rct', 'emergency root canal', 'pain relief rct'],
      },
      {
        slug: 'trauma-management',
        name: 'Trauma Management',
        unit: 'per_procedure',
        min: 2000,
        max: 20000,
        openEnded: true,
        patientDescription: 'Care after a knocked-out, broken or displaced tooth.',
        synonyms: ['trauma', 'broken tooth', 'knocked out tooth', 'injury'],
      },
    ],
  },

  {
    slug: 'sedation-special-care',
    name: 'Sedation / Special Care',
    patientDescription: 'Treatment made possible for anxious patients and special needs.',
    services: [
      {
        slug: 'nitrous-sedation',
        name: 'Nitrous Sedation',
        unit: 'per_session',
        min: 2000,
        max: 5000,
        synonyms: ['nitrous', 'laughing gas', 'sedation'],
      },
      {
        slug: 'iv-sedation',
        name: 'IV Sedation',
        unit: 'per_session',
        min: 5000,
        max: 15000,
        openEnded: true,
        synonyms: ['iv sedation', 'intravenous sedation', 'sleep dentistry'],
      },
      {
        slug: 'special-needs-dental-care',
        name: 'Special-Needs Dental Care',
        unit: 'custom_quote',
        customQuote: true,
        patientDescription:
          'Care adapted to a disability or medical condition. Priced case by case, because the adaptations needed differ for every patient.',
        synonyms: ['special needs', 'disability dental care'],
      },
    ],
  },

  {
    slug: 'other-laboratory',
    name: 'Other / Laboratory Charges',
    patientDescription: 'Appliances and laboratory work.',
    services: [
      {
        slug: 'night-guard',
        name: 'Night Guard',
        unit: 'per_appliance',
        min: 3000,
        max: 10000,
        patientDescription: 'Worn at night if you grind your teeth.',
        synonyms: ['night guard', 'nightguard', 'bruxism guard', 'grinding guard'],
      },
      {
        slug: 'sports-mouthguard',
        name: 'Sports Mouthguard',
        unit: 'per_appliance',
        min: 3000,
        max: 8000,
        synonyms: ['mouthguard', 'sports guard', 'gum shield'],
      },
      {
        slug: 'dental-lab-custom-appliance',
        name: 'Dental Lab / Custom Appliance',
        unit: 'custom_quote',
        customQuote: true,
        synonyms: ['lab charges', 'custom appliance', 'laboratory'],
      },
    ],
  },
] as const;

/** Rupees to paise. The one place the conversion happens. */
export function rupeesToMinor(rupees: number): bigint {
  if (!Number.isInteger(rupees)) {
    throw new Error(
      `Catalogue prices are transcribed in whole rupees; got ${rupees}. A fractional rupee here means a typo, not a real price.`,
    );
  }
  return BigInt(rupees) * 100n;
}

export const CATALOGUE_SERVICE_COUNT = CATALOGUE.reduce(
  (total, category) => total + category.services.length,
  0,
);

export const CATALOGUE_VARIANT_COUNT = CATALOGUE.reduce(
  (total, category) =>
    total + category.services.reduce((n, service) => n + (service.variants?.length ?? 0), 0),
  0,
);

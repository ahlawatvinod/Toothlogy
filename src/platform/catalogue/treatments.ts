/**
 * TOOTHLOGY TREATMENT CATALOGUE — reference data
 *
 * The platform-wide list of dental treatments a clinic can offer. Clinics set
 * their own price, duration and availability for each; the NAME, description
 * and patient guidance come from here, so "root canal treatment" means the
 * same thing on every clinic page and search can compare like with like.
 *
 * WHAT THIS IS, AND IS NOT
 * General, plain-language patient information written to be accurate for most
 * people. It is not advice for any individual: every description is shown with
 * the reminder that the treating dentist decides what is right for a patient.
 * Durations are TYPICAL single-visit lengths used to size a booking slot, not
 * a promise; the clinic's own duration always wins.
 *
 * Seeded by `prisma/seed.mts`; the database copy is what clinics reference.
 */

export type TreatmentCategory =
  | 'consultation'
  | 'preventive'
  | 'diagnostic'
  | 'restorative'
  | 'endodontic'
  | 'prosthodontic'
  | 'surgical'
  | 'periodontal'
  | 'orthodontic'
  | 'pediatric'
  | 'cosmetic'
  | 'emergency'
  | 'oral_medicine';

export interface TreatmentDefinition {
  readonly key: string;
  readonly name: string;
  readonly category: TreatmentCategory;
  readonly specialtyKey?: string;
  readonly description: string;
  readonly typicalDurationMinutes: number;
  readonly preparation?: string;
  readonly aftercare?: string;
  readonly eligibility?: string;
  readonly isEmergencyEligible?: boolean;
}

export const TREATMENT_CATEGORY_LABELS: Readonly<Record<TreatmentCategory, string>> = {
  consultation: 'Consultations',
  preventive: 'Preventive care',
  diagnostic: 'X-rays and scans',
  restorative: 'Fillings and repairs',
  endodontic: 'Root canal care',
  prosthodontic: 'Crowns, bridges and dentures',
  surgical: 'Extractions and oral surgery',
  periodontal: 'Gum care',
  orthodontic: 'Braces and aligners',
  pediatric: 'Children’s dentistry',
  cosmetic: 'Cosmetic dentistry',
  emergency: 'Emergency care',
  oral_medicine: 'Oral medicine',
};

export const TREATMENTS: readonly TreatmentDefinition[] = [
  // --- Consultation -----------------------------------------------------------
  {
    key: 'dental_consultation',
    name: 'Dental consultation',
    category: 'consultation',
    specialtyKey: 'general_dentistry',
    description:
      'An examination of your teeth and gums, a discussion of any problem you have, and a treatment plan with its options and costs explained before anything is done.',
    typicalDurationMinutes: 20,
    preparation: 'Bring any recent dental X-rays or reports, and a list of medicines you take.',
    isEmergencyEligible: true,
  },
  {
    key: 'second_opinion',
    name: 'Second opinion',
    category: 'consultation',
    description:
      'A review of a treatment plan you have already been given by another dentist, so you can decide with more confidence.',
    typicalDurationMinutes: 30,
    preparation: 'Bring the treatment plan, any X-rays and the quotation you received.',
  },
  {
    key: 'video_consultation',
    name: 'Video consultation',
    category: 'consultation',
    description:
      'A consultation by video for advice, triage and follow-up. A dentist cannot examine or treat you by video, so some problems will need an in-person visit.',
    typicalDurationMinutes: 15,
  },

  // --- Preventive ---------------------------------------------------------------
  {
    key: 'scaling_polishing',
    name: 'Scaling and polishing (cleaning)',
    category: 'preventive',
    specialtyKey: 'periodontics',
    description:
      'Removal of hardened plaque (tartar) and stains from the tooth surfaces, followed by polishing. It helps prevent gum disease and bad breath.',
    typicalDurationMinutes: 45,
    aftercare: 'Some sensitivity for a day or two is normal. Keep brushing twice a day and clean between your teeth.',
  },
  {
    key: 'fluoride_application',
    name: 'Fluoride application',
    category: 'preventive',
    description: 'A fluoride varnish painted onto the teeth to strengthen enamel and reduce the risk of decay.',
    typicalDurationMinutes: 15,
    aftercare: 'Avoid eating and drinking for about 30 minutes afterwards, or as your dentist advises.',
  },
  {
    key: 'pit_fissure_sealants',
    name: 'Pit and fissure sealants',
    category: 'preventive',
    specialtyKey: 'pedodontics',
    description:
      'A thin protective coating on the grooves of the back teeth, where decay often starts. Commonly offered to children.',
    typicalDurationMinutes: 30,
  },

  // --- Diagnostic -------------------------------------------------------------------
  {
    key: 'iopa_xray',
    name: 'Intraoral X-ray (IOPA)',
    category: 'diagnostic',
    description: 'A small X-ray of one or a few teeth, used to check for decay, infection or bone loss around the root.',
    typicalDurationMinutes: 10,
    preparation: 'Tell the clinic if you are or might be pregnant.',
  },
  {
    key: 'opg_xray',
    name: 'Panoramic X-ray (OPG)',
    category: 'diagnostic',
    description:
      'A single X-ray showing all the teeth and both jaws, often used before braces, implants or wisdom tooth removal.',
    typicalDurationMinutes: 15,
    preparation: 'Remove jewellery, glasses and removable dentures. Tell the clinic if you are or might be pregnant.',
  },
  {
    key: 'cbct_scan',
    name: '3D scan (CBCT)',
    category: 'diagnostic',
    description:
      'A cone-beam CT scan giving a three-dimensional view of the teeth and jaw bone, typically used to plan implants or complex surgery.',
    typicalDurationMinutes: 20,
    preparation: 'Remove metal items from the head and neck. Tell the clinic if you are or might be pregnant.',
  },

  // --- Restorative ------------------------------------------------------------------
  {
    key: 'composite_filling',
    name: 'Tooth-coloured filling (composite)',
    category: 'restorative',
    description: 'Decay is removed and the tooth is rebuilt with a tooth-coloured material bonded in place.',
    typicalDurationMinutes: 45,
    aftercare: 'If your mouth was numbed, avoid hot drinks and chewing until the numbness wears off.',
  },
  {
    key: 'gic_filling',
    name: 'Glass ionomer filling',
    category: 'restorative',
    description:
      'A filling material that releases fluoride, often used for children’s teeth, near the gum line or as a temporary filling.',
    typicalDurationMinutes: 30,
  },
  {
    key: 'inlay_onlay',
    name: 'Inlay or onlay',
    category: 'restorative',
    specialtyKey: 'prosthodontics',
    description:
      'A custom-made restoration fitted into or over a damaged back tooth when a filling would be too large. Usually two visits.',
    typicalDurationMinutes: 60,
  },

  // --- Endodontic ---------------------------------------------------------------
  {
    key: 'root_canal_treatment',
    name: 'Root canal treatment',
    category: 'endodontic',
    specialtyKey: 'endodontics',
    description:
      'Treatment of an infected or inflamed tooth nerve: the inside of the tooth is cleaned, disinfected and sealed. It often takes one to three visits, and a crown is frequently advised afterwards.',
    typicalDurationMinutes: 90,
    aftercare:
      'Tenderness for a few days is common. Avoid chewing hard food on the tooth until it is permanently restored.',
    isEmergencyEligible: true,
  },
  {
    key: 'root_canal_retreatment',
    name: 'Root canal re-treatment',
    category: 'endodontic',
    specialtyKey: 'endodontics',
    description: 'Repeating root canal treatment on a tooth where an earlier treatment has not healed.',
    typicalDurationMinutes: 90,
  },
  {
    key: 'pulpotomy',
    name: 'Pulp treatment for a milk tooth (pulpotomy)',
    category: 'pediatric',
    specialtyKey: 'pedodontics',
    description:
      'Removal of the infected part of the nerve in a child’s milk tooth, so the tooth can be kept until it falls out naturally.',
    typicalDurationMinutes: 45,
    eligibility: 'Children with decayed milk teeth.',
  },

  // --- Prosthodontic ----------------------------------------------------------------
  {
    key: 'crown_metal_ceramic',
    name: 'Crown (metal-ceramic)',
    category: 'prosthodontic',
    specialtyKey: 'prosthodontics',
    description:
      'A cap that covers a damaged or root-treated tooth, with a metal core and a tooth-coloured ceramic surface. Usually two visits.',
    typicalDurationMinutes: 60,
  },
  {
    key: 'crown_zirconia',
    name: 'Crown (zirconia or all-ceramic)',
    category: 'prosthodontic',
    specialtyKey: 'prosthodontics',
    description: 'A metal-free, tooth-coloured crown, often chosen for front teeth and for appearance.',
    typicalDurationMinutes: 60,
  },
  {
    key: 'dental_bridge',
    name: 'Dental bridge',
    category: 'prosthodontic',
    specialtyKey: 'prosthodontics',
    description: 'A fixed replacement for one or more missing teeth, supported by crowns on the neighbouring teeth.',
    typicalDurationMinutes: 90,
  },
  {
    key: 'complete_denture',
    name: 'Complete denture',
    category: 'prosthodontic',
    specialtyKey: 'prosthodontics',
    description: 'A removable replacement for all the teeth in one jaw. Made over several visits for fit and comfort.',
    typicalDurationMinutes: 45,
  },
  {
    key: 'partial_denture',
    name: 'Partial denture',
    category: 'prosthodontic',
    specialtyKey: 'prosthodontics',
    description: 'A removable replacement for some missing teeth, held in place by clasps or attachments.',
    typicalDurationMinutes: 45,
  },
  {
    key: 'implant_crown',
    name: 'Crown on an implant',
    category: 'prosthodontic',
    specialtyKey: 'prosthodontics',
    description: 'The visible tooth fitted onto a healed dental implant.',
    typicalDurationMinutes: 45,
  },

  // --- Surgical -------------------------------------------------------------------
  {
    key: 'tooth_extraction',
    name: 'Tooth extraction',
    category: 'surgical',
    specialtyKey: 'oral_surgery',
    description: 'Removal of a tooth that cannot be saved, under local anaesthetic.',
    typicalDurationMinutes: 30,
    preparation: 'Tell the dentist about any blood-thinning medicines or medical conditions.',
    aftercare:
      'Bite on the gauze as advised, avoid spitting, rinsing, smoking and hot food for the first day, and follow the instructions you are given.',
    isEmergencyEligible: true,
  },
  {
    key: 'surgical_extraction',
    name: 'Surgical extraction (including wisdom teeth)',
    category: 'surgical',
    specialtyKey: 'oral_surgery',
    description:
      'Removal of a tooth that is impacted, broken or hard to reach, which may need a small cut in the gum and stitches.',
    typicalDurationMinutes: 60,
    preparation: 'Eat beforehand unless told otherwise, and arrange to rest afterwards.',
    aftercare: 'Swelling and discomfort for a few days are common. Follow the medicine and care instructions you are given.',
  },
  {
    key: 'dental_implant',
    name: 'Dental implant placement',
    category: 'surgical',
    specialtyKey: 'oral_surgery',
    description:
      'A titanium or zirconia post placed in the jaw bone to replace a tooth root. It heals for several weeks to months before a crown is fitted.',
    typicalDurationMinutes: 90,
    preparation: 'A scan (usually CBCT) and a consultation are needed first.',
    eligibility: 'Adults with enough healthy jaw bone; smoking and some conditions affect suitability.',
  },

  // --- Periodontal -------------------------------------------------------------------
  {
    key: 'deep_cleaning',
    name: 'Deep cleaning (scaling and root planing)',
    category: 'periodontal',
    specialtyKey: 'periodontics',
    description:
      'Cleaning below the gum line to treat gum disease, usually done one section of the mouth at a time under local anaesthetic.',
    typicalDurationMinutes: 60,
  },
  {
    key: 'gum_surgery',
    name: 'Gum surgery (flap surgery)',
    category: 'periodontal',
    specialtyKey: 'periodontics',
    description: 'A procedure to clean deep gum pockets and reshape the gum when deep cleaning alone is not enough.',
    typicalDurationMinutes: 90,
  },

  // --- Orthodontic -------------------------------------------------------------------
  {
    key: 'metal_braces',
    name: 'Metal braces',
    category: 'orthodontic',
    specialtyKey: 'orthodontics',
    description:
      'Fixed brackets and wires that gradually straighten teeth, with adjustment visits every few weeks over months to years.',
    typicalDurationMinutes: 60,
    preparation: 'An orthodontic consultation with X-rays and impressions or scans comes first.',
  },
  {
    key: 'ceramic_braces',
    name: 'Ceramic (tooth-coloured) braces',
    category: 'orthodontic',
    specialtyKey: 'orthodontics',
    description: 'Fixed braces with tooth-coloured brackets that are less visible than metal.',
    typicalDurationMinutes: 60,
  },
  {
    key: 'clear_aligners',
    name: 'Clear aligners',
    category: 'orthodontic',
    specialtyKey: 'orthodontics',
    description:
      'A series of removable clear trays, each moving the teeth slightly. They must be worn most of the day to work.',
    typicalDurationMinutes: 45,
  },
  {
    key: 'retainer',
    name: 'Retainer',
    category: 'orthodontic',
    specialtyKey: 'orthodontics',
    description: 'A fixed or removable appliance that keeps teeth in place after braces or aligners.',
    typicalDurationMinutes: 30,
  },

  // --- Pediatric ---------------------------------------------------------------------
  {
    key: 'pediatric_consultation',
    name: 'Children’s dental check-up',
    category: 'pediatric',
    specialtyKey: 'pedodontics',
    description: 'A gentle examination of a child’s teeth and development, with advice for parents on care and diet.',
    typicalDurationMinutes: 30,
    eligibility: 'Children and teenagers.',
  },
  {
    key: 'space_maintainer',
    name: 'Space maintainer',
    category: 'pediatric',
    specialtyKey: 'pedodontics',
    description: 'A small appliance that holds space open after a milk tooth is lost early, so the adult tooth can come through.',
    typicalDurationMinutes: 30,
  },

  // --- Cosmetic ---------------------------------------------------------------------
  {
    key: 'teeth_whitening',
    name: 'Teeth whitening',
    category: 'cosmetic',
    description:
      'Professional lightening of natural tooth colour. It does not change the colour of fillings or crowns, and results vary.',
    typicalDurationMinutes: 60,
    preparation: 'A check-up first, so decay or gum problems are treated before whitening.',
    aftercare: 'Temporary sensitivity is common. Avoid strongly coloured food and drink for a day or two.',
  },
  {
    key: 'veneers',
    name: 'Veneers',
    category: 'cosmetic',
    specialtyKey: 'prosthodontics',
    description:
      'Thin porcelain or composite shells bonded to the front of teeth to change their shape or colour. Usually irreversible.',
    typicalDurationMinutes: 90,
  },

  // --- Emergency --------------------------------------------------------------------
  {
    key: 'emergency_visit',
    name: 'Emergency dental visit',
    category: 'emergency',
    description:
      'Same-day care for severe toothache, swelling, a broken tooth or a knocked-out tooth. The aim is to relieve pain and control infection; further treatment may follow. Seek hospital care at once for swelling that affects breathing or swallowing.',
    typicalDurationMinutes: 30,
    isEmergencyEligible: true,
  },

  // --- Oral medicine ------------------------------------------------------------------
  {
    key: 'oral_lesion_evaluation',
    name: 'Mouth ulcer or patch evaluation',
    category: 'oral_medicine',
    specialtyKey: 'oral_pathology',
    description:
      'Examination of an ulcer, white or red patch or lump in the mouth. Any sore that has not healed in two weeks should be checked.',
    typicalDurationMinutes: 30,
  },
];

export const TREATMENT_BY_KEY: ReadonlyMap<string, TreatmentDefinition> = new Map(TREATMENTS.map((t) => [t.key, t]));

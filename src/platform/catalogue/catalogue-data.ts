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
  /** One line, for a table cell or card. */
  readonly shortDescription?: string;
  /** Suggested range in whole rupees. Omitted where the variant has no range. */
  readonly min?: number;
  readonly max?: number;
  readonly openEnded?: boolean;
  readonly customQuote?: boolean;
  /** What this variant is, and how it differs from its siblings. */
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
  /**
   * The full explanation: what the procedure is, why it may be needed, and
   * what is generally included.
   */
  readonly description?: string;
  /** One line, for a table cell or card. */
  readonly shortDescription?: string;
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
        shortDescription:
          'Examination and advice from a dentist.',
        description:
          'A dentist examines your teeth, gums and bite, discusses any symptoms you have, and explains what they find. Usually includes an examination and a treatment plan; X-rays and any treatment are normally charged separately.',
        unit: 'per_visit',
        min: 300,
        max: 1500,
        patientDescription: 'A dentist examines you and explains what is going on.',
        synonyms: ['consultation', 'checkup', 'check up', 'dentist visit', 'opinion'],
      },
      {
        slug: 'specialist-consultation',
        name: 'Specialist Consultation',
        shortDescription:
          'Opinion from a dentist with specialist training.',
        description:
          'An assessment by a dentist with additional training in a particular area, such as gum treatment, orthodontics or oral surgery. Usually sought when a problem is complex or a general dentist has referred you.',
        unit: 'per_visit',
        min: 500,
        max: 2000,
        synonyms: ['specialist', 'specialist opinion'],
      },
      {
        slug: 'second-opinion',
        name: 'Second Opinion',
        shortDescription:
          'An independent review of a treatment plan you already have.',
        description:
          'A second dentist reviews an existing diagnosis or treatment plan and explains how they would approach it. Useful before committing to extensive or expensive treatment. It does not usually include treatment itself.',
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
        shortDescription:
          'Urgent assessment when something is badly wrong.',
        description:
          'A same-day or out-of-hours assessment for severe pain, swelling, bleeding or injury. The aim is to identify the problem and relieve symptoms; definitive treatment is often carried out at a later appointment and charged separately.',
        unit: 'per_visit',
        min: 500,
        max: 2000,
        alsoIn: ['emergency-dentistry'],
        synonyms: ['emergency', 'urgent', 'pain', 'toothache', 'out of hours'],
      },
      {
        slug: 'dental-examination',
        name: 'Dental Examination',
        shortDescription:
          'A routine check of teeth, gums and bite.',
        description:
          'A structured check of the teeth, gums, bite and soft tissues, including screening for decay and gum disease. Often combined with a consultation. X-rays are normally charged separately.',
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
        shortDescription:
          'A small X-ray of one or two teeth.',
        description:
          'A single small X-ray showing one or two teeth and the bone around them. Commonly taken to investigate pain, check for decay between teeth, or assess a tooth before or after root canal treatment. Priced per film.',
        unit: 'per_procedure',
        min: 200,
        max: 500,
        patientDescription: 'A small X-ray of one or two teeth.',
        synonyms: ['xray', 'x ray', 'x-ray', 'iopa', 'rvg', 'radiograph'],
      },
      {
        slug: 'opg',
        name: 'OPG',
        shortDescription:
          'One X-ray showing all the teeth and both jaws.',
        description:
          'A single wide X-ray capturing all the teeth, both jaws and the jaw joints. Used to get an overall view before extractions, orthodontics or implants, or to check wisdom teeth.',
        unit: 'per_procedure',
        min: 500,
        max: 1200,
        patientDescription: 'A single X-ray showing all your teeth and both jaws.',
        synonyms: ['opg', 'panoramic', 'orthopantomogram', 'full mouth xray'],
      },
      {
        slug: 'cbct',
        name: 'CBCT',
        shortDescription:
          'A 3D scan of the jaw.',
        description:
          'A three-dimensional scan giving detailed views of bone, nerves and sinuses. Most often taken before implant placement or complex surgery, where a flat X-ray cannot show the depth and position of structures.',
        unit: 'per_procedure',
        min: 1500,
        max: 5000,
        patientDescription: 'A 3D scan, usually before implants or difficult surgery.',
        synonyms: ['cbct', '3d scan', 'cone beam', 'ct scan'],
      },
      {
        slug: 'digital-smile-design-analysis',
        name: 'Digital Smile / Design Analysis',
        shortDescription:
          'Digital planning of how a smile could look.',
        description:
          'Photographs and digital planning used to design proposed changes to the appearance of the teeth before treatment begins. Usually a planning fee; the treatment itself is quoted separately.',
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
        shortDescription:
          'Professional cleaning to remove plaque and tartar.',
        description:
          'Removal of plaque, tartar and staining from the tooth surfaces, usually followed by polishing. Recommended periodically to help control gum inflammation. Cleaning below the gum line is a separate, deeper procedure.',
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
        shortDescription:
          'A protective fluoride coating.',
        description:
          'A concentrated fluoride varnish or gel applied to the teeth to help strengthen enamel and reduce the risk of decay. Often used for children and for adults at higher risk of decay. Usually charged per visit.',
        unit: 'per_visit',
        min: 500,
        max: 1500,
        alsoIn: ['pediatric-dentistry'],
        synonyms: ['fluoride', 'fluoride treatment', 'fluoride varnish'],
      },
      {
        slug: 'pit-fissure-sealant',
        name: 'Pit & Fissure Sealant',
        shortDescription:
          'A protective coating for the grooves of back teeth.',
        description:
          'A thin coating applied into the deep grooves of the back teeth, where a brush cannot reach, to make them easier to keep clean. Most often placed on children\'s permanent molars. Priced per tooth.',
        unit: 'per_tooth',
        min: 500,
        max: 1500,
        alsoIn: ['pediatric-dentistry'],
        synonyms: ['sealant', 'fissure sealant', 'pit and fissure'],
      },
      {
        slug: 'desensitization',
        name: 'Desensitization',
        shortDescription:
          'Treatment for teeth that hurt with cold or sweet things.',
        description:
          'Application of desensitising agents to exposed or sensitive tooth surfaces to reduce discomfort from cold, heat or sweet foods. May need repeating, and does not treat an underlying cause such as decay or a cracked tooth.',
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
        shortDescription:
          'A tooth-coloured repair for a decayed or damaged tooth.',
        description:
          'Decayed or damaged tooth structure is removed and rebuilt with a tooth-coloured material shaded to match the surrounding tooth. Priced per tooth; a larger cavity generally takes longer and costs more.',
        unit: 'per_tooth',
        min: 800,
        max: 2500,
        synonyms: ['filling', 'cavity', 'tooth colored filling', 'white filling'],
      },
      {
        slug: 'gic-filling',
        name: 'GIC Filling',
        shortDescription:
          'A glass ionomer filling, often used as an interim repair.',
        description:
          'A filling made from glass ionomer cement, which bonds to tooth structure and releases fluoride. Frequently used for children, root-surface cavities, and as a temporary or intermediate restoration.',
        unit: 'per_tooth',
        min: 500,
        max: 1500,
        synonyms: ['gic', 'glass ionomer', 'cement filling'],
      },
      {
        slug: 'composite-restoration',
        name: 'Composite Restoration',
        shortDescription:
          'Tooth-coloured rebuilding of a chipped or worn tooth.',
        description:
          'Tooth-coloured composite resin bonded to rebuild a chipped, worn or discoloured tooth, or to close a small gap. Priced per tooth; more extensive rebuilding takes longer.',
        unit: 'per_tooth',
        min: 1000,
        max: 3000,
        synonyms: ['composite', 'bonding', 'tooth bonding'],
      },
      {
        slug: 'inlay-onlay',
        name: 'Inlay / Onlay',
        shortDescription:
          'A laboratory-made filling for a heavily damaged tooth.',
        description:
          'A restoration made in a laboratory and then bonded into or over the tooth, used where a cavity is too large for a direct filling but the tooth does not need a full crown. Usually needs two appointments.',
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
        shortDescription:
          'Treatment of infection inside a tooth so it can be kept.',
        description:
          'The infected or damaged nerve tissue inside a tooth is removed, the canals are cleaned and shaped, and the space is sealed. Carried out to relieve pain and keep a tooth that would otherwise need removing. The price usually covers the root canal itself; a crown or permanent restoration afterwards is normally separate. Cost varies with the tooth: back teeth have more canals and take longer.',
        unit: 'per_tooth',
        min: 3000,
        max: 18000,
        patientDescription:
          'Cleaning out the infected nerve inside a tooth and sealing it, so the tooth can stay rather than being removed.',
        synonyms: ['rct', 'root canal', 'root canal treatment', 'nerve treatment', 'endodontic'],
        variants: [
          {
            slug: 'anterior',
            name: 'Anterior',
            description:
              'A front tooth, which usually has a single canal and is the quickest of the three to treat.',
            min: 3000,
            max: 7000,
          },
          {
            slug: 'premolar',
            name: 'Premolar',
            description:
              'A tooth in front of the molars, typically with one or two canals.',
            min: 4000,
            max: 9000,
          },
          {
            slug: 'molar',
            name: 'Molar',
            description:
              'A back tooth, usually with three or more canals, so it takes longer and costs more than a front tooth.',
            min: 5000,
            max: 12000,
          },
          {
            slug: 're-rct',
            name: 'Re-RCT',
            description:
              'Redoing a root canal that has failed or become reinfected. The existing filling material must be removed first, which makes it more involved than the original treatment.',
            min: 7000,
            max: 18000,
          },
          {
            slug: 'single-visit',
            name: 'Single Visit',
            description:
              'The whole treatment completed in one longer appointment, where the tooth and the symptoms allow it.',
          },
          {
            slug: 'multiple-visit',
            name: 'Multiple Visit',
            description:
              'Treatment spread over two or more appointments, with a dressing in place between them. Often preferred where there is active infection.',
          },
        ],
      },
      {
        slug: 'rct-crown-package',
        name: 'RCT + Crown Package',
        shortDescription:
          'Root canal and the crown that protects the tooth afterwards.',
        description:
          'A combined price covering root canal treatment and the crown usually needed afterwards to protect the tooth. What is included varies between clinics - check whether consultation, X-rays and any temporary restoration are covered.',
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
        shortDescription:
          'A cap fitted over a tooth to protect and rebuild it.',
        description:
          'A custom-made cap that covers the whole visible part of a tooth, used where a tooth is heavily filled, cracked, worn or has had root canal treatment. Usually needs two appointments, with a temporary crown in between. Priced per crown; the material chosen affects both appearance and cost.',
        unit: 'per_crown',
        // Spans every variant below, including the temporary crown at ₹1,000.
        // A service range that does not cover its own variants makes the
        // summary line on a category page contradict the detail beneath it.
        min: 1000,
        max: 20000,
        patientDescription: 'A cap fitted over a tooth to protect and rebuild it.',
        synonyms: ['crown', 'cap', 'tooth cap', 'capping', 'temporary crown', 'zirconia'],
        variants: [
          {
            slug: 'metal',
            name: 'Metal',
            description:
              'A full-metal crown. The strongest and most conservative of the options, but silver or gold in colour, so it is normally used on back teeth.',
            min: 2500,
            max: 6000,
          },
          {
            slug: 'pfm',
            name: 'PFM',
            description:
              'Porcelain fused to metal: a metal substructure with a tooth-coloured outer layer. A long-established compromise between strength and appearance.',
            min: 4000,
            max: 8000,
          },
          {
            slug: 'zirconia',
            name: 'Zirconia',
            description:
              'A crown milled from zirconia. Strong and tooth-coloured, and used for both front and back teeth.',
            min: 8000,
            max: 18000,
          },
          {
            slug: 'e-max',
            name: 'E-Max',
            description:
              'A crown made from lithium disilicate glass ceramic, which transmits light in a way that closely resembles natural enamel. Usually chosen for front teeth.',
            min: 10000,
            max: 20000,
          },
          {
            slug: 'full-ceramic',
            name: 'Full Ceramic',
            description:
              'An all-ceramic crown with no metal substructure, chosen mainly where appearance matters most.',
          },
          {
            slug: 'temporary',
            name: 'Temporary',
            description:
              'A short-term crown fitted while the permanent one is being made. Intended to protect the tooth for a few weeks, not to last.',
            min: 1000,
            max: 3000,
          },
          {
            slug: 'premium-zirconia',
            name: 'Premium Zirconia',
            description:
              'A layered or higher-translucency zirconia crown, usually for front teeth where appearance is the priority.',
          },
          {
            slug: 'other',
            name: 'Other',
            description:
              'A crown material not listed here. Ask the clinic what is being proposed and why.',
          },
        ],
      },
      {
        slug: 'dental-bridge',
        name: 'Dental Bridge',
        shortDescription:
          'A fixed replacement for a missing tooth.',
        description:
          'A fixed replacement for one or more missing teeth, anchored to the natural teeth on either side of the gap. Those supporting teeth are reshaped as part of the process. Usually priced per unit, so a longer bridge costs more.',
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
        shortDescription:
          'Removal of a tooth that can be lifted out whole.',
        description:
          'Removal of a tooth that is accessible and can be eased out without surgery, carried out under local anaesthetic. Priced per tooth.',
        unit: 'per_tooth',
        min: 800,
        max: 2500,
        synonyms: ['extraction', 'tooth removal', 'pull tooth', 'remove tooth'],
      },
      {
        slug: 'surgical-extraction',
        name: 'Surgical Extraction',
        shortDescription:
          'Removal of a tooth that needs a surgical approach.',
        description:
          'Removal of a tooth that cannot be lifted out whole - because it is broken at the gum line, curved, or partly buried - usually requiring the gum to be lifted and the tooth to be sectioned. Priced per tooth.',
        unit: 'per_tooth',
        min: 2000,
        max: 6000,
        synonyms: ['surgical extraction'],
      },
      {
        slug: 'wisdom-tooth-extraction',
        name: 'Wisdom Tooth Extraction',
        shortDescription:
          'Removal of a wisdom tooth.',
        description:
          'Removal of a third molar, often because it is decayed, repeatedly infected, or has no room to come through properly. Difficulty and price vary considerably with position and root shape.',
        unit: 'per_tooth',
        min: 3000,
        max: 10000,
        synonyms: ['wisdom tooth', 'wisdom teeth', 'third molar'],
      },
      {
        slug: 'impacted-wisdom-tooth-surgery',
        name: 'Impacted Wisdom Tooth Surgery',
        shortDescription:
          'Surgical removal of a buried wisdom tooth.',
        description:
          'Surgical removal of a wisdom tooth that has not come through and is lying within the bone or against the neighbouring tooth. Usually involves lifting the gum, removing some bone and sectioning the tooth, and often needs stitches.',
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
        shortDescription:
          'A removable replacement for missing teeth.',
        description:
          'A removable appliance replacing some or all of the teeth in a jaw, made to fit over the gums. Usually needs several appointments for impressions, try-in and fitting, and adjustments afterwards are normal. Priced per arch; the material and design affect the cost.',
        unit: 'per_arch',
        min: 5000,
        max: 150000,
        openEnded: true,
        patientDescription: 'A removable replacement for missing teeth.',
        synonyms: ['denture', 'dentures', 'false teeth', 'artificial teeth'],
        variants: [
          {
            slug: 'complete',
            name: 'Complete',
            description:
              'Replaces all the teeth in a jaw, resting on the gums. Used when no natural teeth remain in that arch.',
            min: 8000,
            max: 30000,
          },
          {
            slug: 'partial',
            name: 'Partial',
            description:
              'Replaces some of the teeth in a jaw and clasps onto the remaining natural teeth.',
            min: 5000,
            max: 25000,
          },
          {
            slug: 'flexible',
            name: 'Flexible',
            description:
              'Made from a flexible material with no metal clasps, which some people find more comfortable and less visible.',
            min: 8000,
            max: 20000,
          },
          {
            slug: 'acrylic',
            name: 'Acrylic',
            description:
              'A conventional acrylic denture. Usually the most economical option, and straightforward to adjust or add to later.',
          },
          {
            slug: 'metal-framework',
            name: 'Metal Framework',
            description:
              'A partial denture built on a cast metal frame, which is thinner and generally more durable than acrylic alone.',
          },
          {
            slug: 'implant-supported',
            name: 'Implant-Supported',
            description:
              'A denture that clips onto implants rather than resting on the gums, which holds it considerably more securely. The implants are a separate cost.',
            min: 50000,
            max: 150000,
            openEnded: true,
          },
          {
            slug: 'premium',
            name: 'Premium',
            description:
              'A denture using higher-grade teeth and materials, usually with more try-in appointments to refine fit and appearance.',
          },
          {
            slug: 'economy',
            name: 'Economy',
            description:
              'A basic denture using standard materials and fewer appointments.',
          },
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
        shortDescription:
          'A titanium post placed in the jaw to replace a tooth root.',
        description:
          'A titanium post placed into the jawbone to act as an artificial tooth root, which a crown, bridge or denture is later attached to. Healing between placement and the final restoration commonly takes several months. Check carefully what a quoted price includes: the implant alone, or the abutment and crown as well.',
        unit: 'per_implant',
        min: 20000,
        max: 80000,
        openEnded: true,
        patientDescription:
          'A titanium post placed in the jaw, which a crown is later fitted to.',
        synonyms: ['implant', 'dental implant', 'tooth implant', 'implants'],
        variants: [
          {
            slug: 'placement-only',
            name: 'Implant Placement Only',
            description:
              'The surgical placement of the implant itself. The abutment and crown that go on top are quoted separately.',
            min: 20000,
            max: 50000,
          },
          {
            slug: 'implant-abutment',
            name: 'Implant + Abutment',
            description:
              'The implant and the connector that will later support the crown, but not the crown itself.',
          },
          {
            slug: 'implant-crown',
            name: 'Implant + Crown',
            description:
              'The implant and the crown fitted to it. Check whether the abutment is included.',
          },
          {
            slug: 'implant-abutment-crown',
            name: 'Implant + Abutment + Crown',
            description:
              'The complete replacement tooth: implant, abutment and crown. Usually the most straightforward price to compare between clinics.',
            min: 35000,
            max: 80000,
            openEnded: true,
          },
          {
            slug: 'standard-implant',
            name: 'Standard Implant',
            description:
              'An implant from a mainstream manufacturer.',
          },
          {
            slug: 'premium-implant',
            name: 'Premium Implant',
            description:
              'An implant from a manufacturer with a longer clinical track record or wider availability of replacement parts, which can matter for future repairs.',
          },
        ],
      },
      {
        // A separate operation, not an implant variant. See note 3.
        slug: 'bone-grafting',
        name: 'Bone Grafting',
        shortDescription:
          'Rebuilding bone where there is not enough for an implant.',
        description:
          'Bone or a bone substitute is added where the jaw is too thin or too shallow to hold an implant securely. Often carried out before, or at the same time as, implant placement, and usually needs months of healing.',
        unit: 'per_procedure',
        min: 10000,
        max: 40000,
        openEnded: true,
        synonyms: ['bone graft', 'bone grafting', 'graft'],
      },
      {
        slug: 'sinus-lift',
        name: 'Sinus Lift',
        shortDescription:
          'Creating bone height in the upper back jaw for an implant.',
        description:
          'The floor of the sinus above the upper back teeth is raised and grafting material placed beneath it, to create enough bone height for an implant. A specialised procedure needing a healing period before the implant is restored.',
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
        shortDescription:
          'Fixed appliances that move teeth into position over months.',
        description:
          'Brackets fixed to the teeth and connected by a wire, adjusted at regular visits to move teeth gradually into a better position. Treatment commonly runs from several months to a couple of years. Usually priced per case; check whether adjustment visits and retainers afterwards are included.',
        unit: 'per_case',
        min: 25000,
        max: 80000,
        patientDescription: 'Fixed appliances that move teeth into position over months.',
        synonyms: ['braces', 'brackets', 'wire braces', 'teeth straightening'],
        variants: [
          {
            slug: 'metal',
            name: 'Metal',
            description:
              'Stainless steel brackets. The most economical option and effective for all types of movement, but the most visible.',
            min: 25000,
            max: 50000,
          },
          {
            slug: 'ceramic',
            name: 'Ceramic',
            description:
              'Tooth-coloured brackets, which are much less noticeable than metal but more prone to chipping.',
            min: 35000,
            max: 70000,
          },
          {
            slug: 'self-ligating',
            name: 'Self-Ligating',
            description:
              'Brackets that hold the wire with a built-in clip instead of elastic ties, which can mean fewer adjustment visits.',
            min: 40000,
            max: 80000,
          },
          {
            slug: 'lingual',
            name: 'Lingual',
            description:
              'Brackets fitted to the inner surfaces of the teeth so they are hidden from the front. More technically demanding, and usually the most expensive fixed option.',
          },
          {
            slug: 'other',
            name: 'Other',
            description:
              'A bracket system not listed here. Ask the clinic what is being proposed and why.',
          },
        ],
      },
      {
        slug: 'clear-aligners',
        name: 'Clear Aligners',
        shortDescription:
          'Removable transparent trays, changed every few weeks.',
        description:
          'A series of clear removable trays, each worn for a set period, that move the teeth in small steps. They must be worn for most of the day to work. Priced per case, and the number of trays needed drives the cost.',
        unit: 'per_case',
        min: 50000,
        max: 200000,
        openEnded: true,
        patientDescription: 'Removable transparent trays, changed every few weeks.',
        synonyms: ['aligners', 'clear aligners', 'invisible braces', 'invisalign'],
        variants: [
          {
            slug: 'basic',
            name: 'Basic',
            description:
              'A short course of aligners for minor movement, usually of the front teeth only.',
          },
          {
            slug: 'standard',
            name: 'Standard',
            description:
              'A full course covering most common alignment problems.',
          },
          {
            slug: 'premium',
            name: 'Premium',
            description:
              'A comprehensive course with more aligners and, usually, included refinements.',
          },
          {
            slug: 'full-case',
            name: 'Full Case',
            description:
              'Treatment of both arches, addressing alignment and bite together.',
          },
          {
            slug: 'limited-case',
            name: 'Limited Case',
            description:
              'Treatment limited to specific teeth or one arch, where the bite does not need changing.',
          },
          {
            slug: 'refinement',
            name: 'Refinement',
            description:
              'Additional aligners made towards the end of treatment to fine-tune the result.',
          },
        ],
      },
      {
        slug: 'retainers',
        name: 'Retainers',
        shortDescription:
          'Worn after treatment to stop teeth drifting back.',
        description:
          'A fixed wire or removable appliance worn after orthodontic treatment to hold the teeth in their new position. Teeth tend to move throughout life, so retainers are usually needed long term. Priced per appliance; replacements are charged again.',
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
        shortDescription:
          'Professional lightening of the natural tooth shade.',
        description:
          'A peroxide-based gel is used, in the clinic or in custom trays at home, to lighten the natural shade of the teeth. It does not change the colour of fillings, crowns or veneers, which may need replacing to match. Results vary between people and are not permanent.',
        unit: 'per_session',
        min: 5000,
        max: 15000,
        synonyms: ['whitening', 'bleaching', 'teeth whitening', 'teeth bleaching'],
      },
      {
        slug: 'composite-veneer',
        name: 'Composite Veneer',
        shortDescription:
          'A tooth-coloured facing built directly onto the tooth.',
        description:
          'Tooth-coloured composite is shaped and bonded directly onto the front of a tooth to change its shape, colour or alignment. Usually completed in one visit. Priced per tooth, and may need repair or replacement over time.',
        unit: 'per_tooth',
        min: 2000,
        max: 6000,
        synonyms: ['veneer', 'composite veneer'],
      },
      {
        slug: 'porcelain-emax-veneer',
        name: 'Porcelain / E-Max Veneer',
        shortDescription:
          'A laboratory-made facing bonded to the front of a tooth.',
        description:
          'A thin laboratory-made porcelain facing bonded to the front of a tooth. Usually requires some reshaping of the natural tooth, which is not reversible. Priced per tooth and normally needs two appointments.',
        unit: 'per_tooth',
        min: 8000,
        max: 20000,
        synonyms: ['porcelain veneer', 'emax veneer', 'e-max veneer', 'laminates'],
      },
      {
        slug: 'smile-makeover',
        name: 'Smile Makeover',
        shortDescription:
          'A combined plan to change the appearance of several teeth.',
        description:
          'A planned combination of treatments - which may include whitening, veneers, crowns, gum work or orthodontics - to change the appearance of the smile. Priced per case after assessment, because what is involved differs for every patient.',
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
        shortDescription:
          'An examination and advice appointment for a child.',
        description:
          'An examination of a child\'s teeth, bite and development, with advice on brushing, diet and prevention. Often kept short and unhurried so the child becomes comfortable with the clinic.',
        unit: 'per_visit',
        min: 300,
        max: 1000,
        synonyms: ['child consultation', 'kids dentist', 'paediatric consultation'],
      },
      {
        slug: 'pulpotomy',
        name: 'Pulpotomy',
        shortDescription:
          'A root canal for a baby tooth.',
        description:
          'The affected nerve tissue in the crown of a baby tooth is removed and the tooth is dressed and sealed, so it can be kept until it is naturally due to fall out. Usually followed by a crown to protect the tooth.',
        unit: 'per_tooth',
        min: 2000,
        max: 5000,
        patientDescription: 'A root canal for a baby tooth.',
        synonyms: ['pulpotomy', 'baby tooth root canal'],
      },
      {
        slug: 'stainless-steel-crown',
        name: 'Stainless-Steel Crown',
        shortDescription:
          'A pre-formed metal cap for a child\'s tooth.',
        description:
          'A pre-formed metal cap fitted over a baby tooth that is too broken down for a filling, often after a pulpotomy. Durable and usually placed in a single visit; it comes away naturally when the tooth is shed.',
        unit: 'per_crown',
        min: 2000,
        max: 5000,
        synonyms: ['stainless steel crown', 'ssc', 'metal cap child'],
      },
      {
        slug: 'space-maintainer',
        name: 'Space Maintainer',
        shortDescription:
          'Holds the gap open when a baby tooth is lost early.',
        description:
          'A small appliance that keeps the space open when a baby tooth is lost sooner than expected, so the neighbouring teeth do not drift into the gap before the adult tooth arrives. Needs periodic review as the child grows.',
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
        shortDescription:
          'Cleaning below the gum line, where scaling cannot reach.',
        description:
          'Removal of hardened deposits from the root surfaces below the gum line, to treat gum disease. Often carried out over more than one appointment, sometimes with local anaesthetic, and followed by a review to check how the gums have responded.',
        unit: 'per_visit',
        min: 1500,
        max: 5000,
        patientDescription: 'Cleaning below the gum line, where ordinary scaling cannot reach.',
        synonyms: ['deep cleaning', 'srp', 'teeth cleaning', 'gum cleaning', 'curettage'],
      },
      {
        slug: 'root-planing',
        name: 'Root Planing',
        shortDescription:
          'Smoothing the root surface to help the gum reattach.',
        description:
          'The root surface is cleaned and smoothed so that plaque is less able to build up and the gum can reattach. Usually priced per quadrant, so treating the whole mouth costs more than treating one area.',
        unit: 'per_quadrant',
        min: 1000,
        max: 3000,
        synonyms: ['root planing', 'planing', 'srp'],
      },
      {
        slug: 'gum-surgery',
        name: 'Gum Surgery',
        shortDescription:
          'Surgical treatment of advanced gum disease.',
        description:
          'Surgical treatment for gum disease that has not responded to cleaning alone, or for reshaping gum tissue. The details vary considerably with the extent of the problem, so quotes are usually given after assessment.',
        unit: 'per_quadrant',
        min: 5000,
        max: 20000,
        openEnded: true,
        synonyms: ['gum surgery', 'gingival surgery'],
      },
      {
        slug: 'periodontal-flap-surgery',
        name: 'Periodontal Flap Surgery',
        shortDescription:
          'Lifting the gum to clean deep deposits and reshape bone.',
        description:
          'The gum is lifted away from the teeth so that deep deposits can be cleaned and the underlying bone reshaped or grafted, then repositioned and stitched. Normally priced per quadrant.',
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
        shortDescription:
          'Removing a small tissue sample for laboratory testing.',
        description:
          'A small sample of tissue is taken and sent for laboratory examination to establish a diagnosis. The laboratory fee may be charged separately, so it is worth asking what a quoted price covers.',
        unit: 'per_procedure',
        min: 3000,
        max: 10000,
        synonyms: ['biopsy', 'tissue test'],
      },
      {
        slug: 'cyst-removal',
        name: 'Cyst Removal',
        shortDescription:
          'Surgical removal of a cyst in the jaw or soft tissue.',
        description:
          'Surgical removal of a fluid-filled sac within the jaw or soft tissues, usually with laboratory examination afterwards. Cost varies widely with size and position.',
        unit: 'per_procedure',
        min: 10000,
        max: 40000,
        openEnded: true,
        synonyms: ['cyst', 'cyst removal'],
      },
      {
        slug: 'minor-oral-surgery',
        name: 'Minor Oral Surgery',
        shortDescription:
          'Smaller surgical procedures in the mouth.',
        description:
          'Covers a range of smaller surgical procedures in the mouth, such as removing a retained root, exposing a buried tooth, or a frenectomy. Quoted after assessment, since the work involved differs in each case.',
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
        shortDescription:
          'A temporary dressing to settle pain.',
        description:
          'A temporary dressing or sedative filling placed to relieve pain and protect a tooth until definitive treatment can be carried out. It is an interim measure, not a permanent repair.',
        unit: 'per_visit',
        min: 500,
        max: 1500,
        patientDescription: 'A temporary dressing to settle pain until proper treatment.',
        synonyms: ['dressing', 'temporary filling', 'emergency dressing'],
      },
      {
        slug: 'emergency-rct',
        name: 'Emergency RCT',
        shortDescription:
          'Opening a tooth to relieve severe pain.',
        description:
          'The tooth is opened and the inflamed nerve tissue relieved to settle severe pain, with the root canal treatment completed at a later appointment. Usually priced per session, and the remaining treatment is charged separately.',
        unit: 'per_session',
        min: 1000,
        max: 3000,
        patientDescription: 'Opening a tooth to relieve severe pain, completed later.',
        synonyms: ['emergency rct', 'emergency root canal', 'pain relief rct'],
      },
      {
        slug: 'trauma-management',
        name: 'Trauma Management',
        shortDescription:
          'Care after a knocked-out, broken or displaced tooth.',
        description:
          'Assessment and immediate care after an injury to the teeth or jaws, which may include repositioning and splinting a tooth, rebuilding a fracture, or arranging follow-up. Cost varies with severity, and injured teeth need monitoring afterwards.',
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
        shortDescription:
          'Inhaled sedation to help with anxiety.',
        description:
          'A mixture of nitrous oxide and oxygen breathed through a small nose mask, which helps you feel calmer during treatment while remaining awake and able to respond. It wears off quickly afterwards. Usually charged per session.',
        unit: 'per_session',
        min: 2000,
        max: 5000,
        synonyms: ['nitrous', 'laughing gas', 'sedation'],
      },
      {
        slug: 'iv-sedation',
        name: 'IV Sedation',
        shortDescription:
          'Sedation given through a vein for anxious patients.',
        description:
          'Sedative medication given through a vein, producing deep relaxation during treatment. You will need an escort home and should not drive afterwards. Requires a medical assessment beforehand and is normally charged per session.',
        unit: 'per_session',
        min: 5000,
        max: 15000,
        openEnded: true,
        synonyms: ['iv sedation', 'intravenous sedation', 'sleep dentistry'],
      },
      {
        slug: 'special-needs-dental-care',
        name: 'Special-Needs Dental Care',
        shortDescription:
          'Care adapted to a disability or medical condition.',
        description:
          'Dental care adapted to a physical, cognitive or medical condition, which may involve longer appointments, additional support, or liaison with your doctor. Priced case by case, because the adaptations needed differ for every patient.',
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
        shortDescription:
          'Worn at night if you grind your teeth.',
        description:
          'A custom-made appliance worn at night to protect the teeth from grinding or clenching, and to reduce strain on the jaw joints and muscles. Made from impressions or a scan, so it usually takes two appointments. Priced per appliance.',
        unit: 'per_appliance',
        min: 3000,
        max: 10000,
        patientDescription: 'Worn at night if you grind your teeth.',
        synonyms: ['night guard', 'nightguard', 'bruxism guard', 'grinding guard'],
      },
      {
        slug: 'sports-mouthguard',
        name: 'Sports Mouthguard',
        shortDescription:
          'A custom guard to protect teeth during sport.',
        description:
          'A custom-fitted guard worn during contact sport to reduce the risk of injury to the teeth, lips and jaw. A made-to-measure guard fits better and stays in place more reliably than a shop-bought one. Priced per appliance.',
        unit: 'per_appliance',
        min: 3000,
        max: 8000,
        synonyms: ['mouthguard', 'sports guard', 'gum shield'],
      },
      {
        slug: 'dental-lab-custom-appliance',
        name: 'Dental Lab / Custom Appliance',
        shortDescription:
          'Laboratory-made appliances quoted individually.',
        description:
          'Covers laboratory work and custom appliances that do not fall under a standard treatment heading. Quoted individually, because the laboratory cost depends entirely on what is being made.',
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

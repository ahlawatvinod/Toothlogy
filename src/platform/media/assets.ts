/**
 * TOOTHLOGY IMAGE ASSET REGISTRY
 *
 * The canonical list of every approved photographic asset the site expects,
 * what it is called, what it depicts, and where it belongs.
 *
 * WHY A REGISTRY RATHER THAN INLINE PATHS
 * Seventy-one image paths scattered through page components is seventy-one
 * places for a filename to be wrong, an alt text to be forgotten, or an asset
 * to be silently dropped in a refactor. Here the set is enumerable, so
 * `npm run assets:audit` can answer "which approved images are still missing"
 * as a fact rather than as someone's recollection.
 *
 * THIS FILE IS A CONTRACT, NOT AN INVENTORY.
 * Listing an asset here does NOT claim the file exists. Presence is a separate
 * question answered by `manifest.generated.ts`, which is produced by scanning
 * the filesystem. An asset that is registered but absent renders as nothing at
 * all — never as a broken image, a grey box, or a stock substitute. That is the
 * whole design: the site is correct with zero images and correct with all
 * seventy-one, and nobody has to edit a component in between.
 *
 * SLUGS ARE STABLE
 * A slug is the filename minus its extension, and it is how a delivered file
 * finds its place on the site. Renaming one silently unhooks an image, so they
 * are treated like the registry IDs elsewhere in the platform: assigned once.
 */

/** Where an asset is meant to be used, which drives its default sizing. */
export type AssetKind =
  /** 1920x600 full-width banner. */
  | 'banner'
  /** Square treatment or service photograph. */
  | 'service';

export interface ImageAsset {
  /** Filename without extension. Stable; never renamed. */
  readonly slug: string;
  /**
   * Alt text, written to describe the image rather than to repeat the heading
   * it sits under. A caption duplicated into alt is read twice by a screen
   * reader and adds nothing (specification §24).
   */
  readonly alt: string;
  readonly kind: AssetKind;
  /**
   * The catalogue service slug this image illustrates, where one exists.
   *
   * This is what lets a treatment card find its own photograph without any
   * component holding a hard-coded mapping — the catalogue already knows every
   * treatment, and the slugs line up.
   */
  readonly serviceSlug?: string;
  /**
   * The dental specialty this image represents on the category grid.
   *
   * A specialty is broader than a treatment — "Endodontics" has no photograph
   * of its own — so one treatment image is nominated to stand for each. Kept
   * on the asset rather than in the page component so the choice is reviewable
   * in one place and cannot differ between two surfaces (§19, section 3).
   */
  readonly specialtyKey?: string;
  /** Free-text note about composition, so a placement decision is reviewable. */
  readonly note?: string;
}

/**
 * Intrinsic dimensions per kind.
 *
 * Declared rather than measured so that `next/image` always receives a width
 * and a height and the browser can reserve the space before the file arrives.
 * Without them every image on the page causes a layout shift as it loads
 * (specification §23).
 */
export const ASSET_DIMENSIONS: Record<AssetKind, { width: number; height: number }> = {
  banner: { width: 1920, height: 600 },
  service: { width: 1024, height: 1024 },
};

/** Public directory each kind is served from. */
export const ASSET_DIRECTORY: Record<AssetKind, string> = {
  banner: '/brand/banners',
  service: '/brand/services',
};

/** Extensions accepted for a delivered asset, in preference order. */
export const ASSET_EXTENSIONS = ['webp', 'avif', 'jpg', 'jpeg', 'png'] as const;

export const IMAGE_ASSETS: readonly ImageAsset[] = [
  // --- Banners (1920x600) -------------------------------------------------
  {
    slug: 'banner-dental-hospital',
    alt: 'Two dentists standing in a modern dental clinic, beside illustrations of an implant, a root canal, a denture and clear aligners',
    kind: 'banner',
    note:
      'Banner 1. A male and a female dentist standing either side of a central tooth, with treatment insets. ' +
      'Homepage hero: the brief names this composition for it, and two clinicians facing the camera is the ' +
      'strongest trust signal of the three.',
  },
  {
    slug: 'banner-dental-promotional',
    alt: 'A modern dental surgery with treatment illustrations including veneers, an implant, a denture, aligners, braces and a root canal',
    kind: 'banner',
    note:
      'Banner 2. Clinic interior and a montage of treatment insets, with no people in frame. ' +
      'Used to introduce the treatments section: it is the one banner that is about the range of ' +
      'work rather than about a person.',
  },
  {
    slug: 'banner-dental-cta',
    alt: 'A smiling patient being examined in a dental chair, beside illustrations of an implant, aligners, a denture and a crown',
    kind: 'banner',
    note:
      'Banner 3. A patient mid-treatment, smiling. Used for the closing call to action: it shows the ' +
      'outcome of booking rather than the clinic that provides it, which is what a conversion band ' +
      'should show.',
  },

  // --- Consultation and diagnosis ------------------------------------------
  { slug: 'dental-consultation', alt: 'Dentist consulting a patient', kind: 'service', specialtyKey: 'general_dentistry', serviceSlug: 'dental-consultation' },
  { slug: 'emergency-dental-consultation', alt: 'Patient receiving urgent dental care', kind: 'service', serviceSlug: 'emergency-consultation' },
  { slug: 'dental-examination', alt: 'Dentist examining a patient’s teeth', kind: 'service', serviceSlug: 'dental-examination' },
  { slug: 'iopa-xray', alt: 'Intraoral periapical dental X-ray', kind: 'service', serviceSlug: 'iopa-xray' },
  { slug: 'opg', alt: 'Panoramic dental X-ray of both jaws', kind: 'service', serviceSlug: 'opg' },
  { slug: 'cbct', alt: 'Cone beam CT scan of the jaw', kind: 'service', specialtyKey: 'oral_radiology', serviceSlug: 'cbct' },
  { slug: 'digital-smile-design', alt: 'Digital smile design analysis on screen', kind: 'service', serviceSlug: 'digital-smile-design-analysis' },

  // --- Preventive ----------------------------------------------------------
  { slug: 'oral-prophylaxis-scaling', alt: 'Professional dental scaling and cleaning', kind: 'service', specialtyKey: 'public_health_dentistry', serviceSlug: 'oral-prophylaxis-scaling' },
  { slug: 'fluoride-application', alt: 'Fluoride varnish being applied to teeth', kind: 'service', serviceSlug: 'fluoride-application' },
  { slug: 'pit-fissure-sealant', alt: 'Pit and fissure sealant applied to a molar', kind: 'service', serviceSlug: 'pit-fissure-sealant' },
  { slug: 'dental-desensitization', alt: 'Treatment for sensitive teeth', kind: 'service', serviceSlug: 'desensitization' },

  // --- Restorative ---------------------------------------------------------
  { slug: 'tooth-coloured-filling', alt: 'Tooth-coloured dental filling', kind: 'service', serviceSlug: 'tooth-coloured-filling' },
  { slug: 'gic-filling', alt: 'Glass ionomer dental filling', kind: 'service', serviceSlug: 'gic-filling' },
  { slug: 'composite-restoration', alt: 'Composite restoration of a front tooth', kind: 'service', serviceSlug: 'composite-restoration' },
  { slug: 'inlay-onlay', alt: 'Dental inlay and onlay restorations', kind: 'service', serviceSlug: 'inlay-onlay' },

  // --- Endodontics ---------------------------------------------------------
  { slug: 'anterior-rct', alt: 'Root canal treatment on a front tooth', kind: 'service' },
  { slug: 'premolar-rct', alt: 'Root canal treatment on a premolar', kind: 'service' },
  { slug: 'molar-rct', alt: 'Root canal treatment on a molar', kind: 'service', specialtyKey: 'endodontics' },
  { slug: 're-rct', alt: 'Repeat root canal treatment', kind: 'service' },
  { slug: 'rct-crown', alt: 'Root canal treatment with a crown', kind: 'service', serviceSlug: 'rct-crown-package' },

  // --- Crowns and prosthodontics -------------------------------------------
  { slug: 'pfm-crown', alt: 'Porcelain-fused-to-metal dental crown', kind: 'service' },
  { slug: 'zirconia-crown', alt: 'Zirconia dental crown', kind: 'service', specialtyKey: 'prosthodontics' },
  { slug: 'emax-crown', alt: 'E-max ceramic dental crown', kind: 'service' },
  { slug: 'metal-crown', alt: 'Metal dental crown', kind: 'service' },
  { slug: 'dental-bridge', alt: 'Fixed dental bridge replacing a missing tooth', kind: 'service', serviceSlug: 'dental-bridge' },
  { slug: 'temporary-crown', alt: 'Temporary dental crown', kind: 'service' },

  // --- Oral surgery --------------------------------------------------------
  { slug: 'simple-extraction', alt: 'Simple tooth extraction', kind: 'service', serviceSlug: 'simple-extraction' },
  { slug: 'surgical-extraction', alt: 'Surgical tooth extraction', kind: 'service', serviceSlug: 'surgical-extraction' },
  { slug: 'wisdom-tooth-extraction', alt: 'Dentist removing a wisdom tooth', kind: 'service', specialtyKey: 'oral_surgery', serviceSlug: 'wisdom-tooth-extraction' },
  { slug: 'impacted-wisdom-tooth', alt: 'Surgery for an impacted wisdom tooth', kind: 'service', serviceSlug: 'impacted-wisdom-tooth-surgery' },
  { slug: 'biopsy', alt: 'Oral tissue biopsy procedure', kind: 'service', specialtyKey: 'oral_pathology', serviceSlug: 'biopsy' },
  { slug: 'cyst-removal', alt: 'Removal of an oral cyst', kind: 'service', serviceSlug: 'cyst-removal' },
  { slug: 'minor-oral-surgery', alt: 'Minor oral surgery procedure', kind: 'service', serviceSlug: 'minor-oral-surgery' },

  // --- Dentures ------------------------------------------------------------
  { slug: 'complete-denture', alt: 'Complete removable denture', kind: 'service' },
  { slug: 'partial-denture', alt: 'Partial removable denture', kind: 'service' },
  { slug: 'flexible-denture', alt: 'Flexible removable denture', kind: 'service' },
  { slug: 'implant-supported-denture', alt: 'Denture supported by dental implants', kind: 'service' },

  // --- Implants ------------------------------------------------------------
  { slug: 'implant-placement', alt: 'Dental implant being placed in the jaw', kind: 'service', specialtyKey: 'implantology' },
  { slug: 'implant-abutment-crown', alt: 'Dental implant with abutment and crown', kind: 'service' },
  { slug: 'bone-grafting', alt: 'Dental bone grafting procedure', kind: 'service', serviceSlug: 'bone-grafting' },
  { slug: 'sinus-lift', alt: 'Sinus lift procedure before an implant', kind: 'service', serviceSlug: 'sinus-lift' },

  // --- Orthodontics --------------------------------------------------------
  { slug: 'metal-braces', alt: 'Metal orthodontic braces', kind: 'service' },
  { slug: 'ceramic-braces', alt: 'Ceramic orthodontic braces', kind: 'service' },
  { slug: 'self-ligating-braces', alt: 'Self-ligating orthodontic braces', kind: 'service' },
  { slug: 'clear-aligners', alt: 'Clear orthodontic aligner trays', kind: 'service', specialtyKey: 'orthodontics', serviceSlug: 'clear-aligners' },
  { slug: 'retainers', alt: 'Orthodontic retainer', kind: 'service', serviceSlug: 'retainers' },

  // --- Cosmetic ------------------------------------------------------------
  { slug: 'teeth-whitening', alt: 'Professional teeth whitening treatment', kind: 'service', serviceSlug: 'teeth-whitening' },
  { slug: 'composite-veneers', alt: 'Composite dental veneers', kind: 'service', serviceSlug: 'composite-veneer' },
  { slug: 'porcelain-emax-veneers', alt: 'Porcelain dental veneers', kind: 'service', serviceSlug: 'porcelain-emax-veneer' },
  {
    slug: 'smile-makeover',
    alt: 'Patient after a full smile makeover',
    kind: 'service',
    specialtyKey: 'cosmetic_dentistry',
    serviceSlug: 'smile-makeover',
    note: 'Created with a model. One of the strongest cosmetic visuals.',
  },

  // --- Paediatric ----------------------------------------------------------
  {
    slug: 'child-consultation',
    alt: 'Child at a dental consultation',
    kind: 'service',
    specialtyKey: 'pedodontics',
    serviceSlug: 'child-consultation',
    note: 'Created with a child.',
  },
  { slug: 'fluoride-treatment', alt: 'Fluoride treatment for a child', kind: 'service' },
  { slug: 'pulpotomy', alt: 'Pulpotomy treatment on a baby tooth', kind: 'service', serviceSlug: 'pulpotomy' },
  { slug: 'stainless-steel-crown', alt: 'Stainless steel crown on a child’s tooth', kind: 'service', serviceSlug: 'stainless-steel-crown' },
  { slug: 'space-maintainer', alt: 'Dental space maintainer appliance', kind: 'service', serviceSlug: 'space-maintainer' },

  // --- Periodontics --------------------------------------------------------
  { slug: 'deep-cleaning', alt: 'Deep dental cleaning below the gum line', kind: 'service', specialtyKey: 'periodontics', serviceSlug: 'deep-cleaning' },
  { slug: 'root-planing', alt: 'Root planing treatment for gum disease', kind: 'service', serviceSlug: 'root-planing' },
  { slug: 'gum-surgery', alt: 'Gum surgery procedure', kind: 'service', serviceSlug: 'gum-surgery' },
  { slug: 'periodontal-flap-surgery', alt: 'Gum being lifted during periodontal surgery', kind: 'service', serviceSlug: 'periodontal-flap-surgery' },

  // --- Emergency -----------------------------------------------------------
  {
    slug: 'emergency-rct',
    alt: 'Patient with dental pain receiving emergency treatment',
    kind: 'service',
    serviceSlug: 'emergency-rct',
  },
  {
    slug: 'dental-trauma',
    alt: 'Dental trauma being assessed',
    kind: 'service',
    serviceSlug: 'trauma-management',
    note: 'Created with an older man.',
  },

  // --- Sedation and special care -------------------------------------------
  { slug: 'nitrous-sedation', alt: 'Patient receiving nitrous oxide sedation', kind: 'service', serviceSlug: 'nitrous-sedation' },
  { slug: 'iv-sedation', alt: 'Patient receiving intravenous sedation', kind: 'service', serviceSlug: 'iv-sedation' },
  {
    slug: 'special-needs-care',
    alt: 'Dental care adapted for a patient with additional needs',
    kind: 'service',
    serviceSlug: 'special-needs-dental-care',
    note: 'Created with an elderly model.',
  },

  // --- Appliances ----------------------------------------------------------
  {
    slug: 'night-guard',
    alt: 'Custom night guard for teeth grinding',
    kind: 'service',
    serviceSlug: 'night-guard',
    note: 'Created with a young woman.',
  },
  {
    slug: 'sports-mouthguard',
    alt: 'An athlete wearing a custom sports mouthguard, beside examples of mouthguards in several colours',
    kind: 'service',
    serviceSlug: 'sports-mouthguard',
    note: 'Created with a sportsperson.',
  },
  {
    slug: 'dental-lab-custom-appliance',
    alt: 'A dental technician in a laboratory holding a clear aligner, beside examples of custom dental appliances',
    kind: 'service',
    serviceSlug: 'dental-lab-custom-appliance',
    note:
      'A dental technician in a laboratory holding an aligner on a model, with insets of an aligner, a ' +
      'partial denture, an expander and a mouthguard. Full-width split feature (§18).',
  },
] as const;

export const ASSET_BY_SLUG: ReadonlyMap<string, ImageAsset> = new Map(
  IMAGE_ASSETS.map((asset) => [asset.slug, asset]),
);

/** Reverse lookup: catalogue service slug to the image that illustrates it. */
export const ASSET_BY_SERVICE_SLUG: ReadonlyMap<string, ImageAsset> = new Map(
  IMAGE_ASSETS.filter((asset) => asset.serviceSlug).map((asset) => [asset.serviceSlug!, asset]),
);

/** Reverse lookup: dental specialty key to the image nominated for it. */
export const ASSET_BY_SPECIALTY_KEY: ReadonlyMap<string, ImageAsset> = new Map(
  IMAGE_ASSETS.filter((asset) => asset.specialtyKey).map((asset) => [asset.specialtyKey!, asset]),
);

export const BANNER_ASSETS = IMAGE_ASSETS.filter((asset) => asset.kind === 'banner');
export const SERVICE_ASSETS = IMAGE_ASSETS.filter((asset) => asset.kind === 'service');

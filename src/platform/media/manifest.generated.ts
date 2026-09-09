/**
 * GENERATED FILE — do not edit by hand.
 *
 * Regenerate with `npm run assets:sync`, which scans the public asset
 * directories and records which approved images are actually present.
 *
 * WHY THIS IS GENERATED AND COMMITTED RATHER THAN READ AT RUNTIME
 * The site must know, while rendering, whether an image exists. Reading the
 * filesystem per request would be a syscall on the hot path and is not
 * reliable on a serverless host, where `public/` is served by a CDN and is not
 * guaranteed to be readable from the function. Committing the scan result
 * makes presence a build-time fact, visible in a diff, and identical in every
 * environment.
 *
 * `tests/media/manifest.test.ts` fails if this file has drifted from the
 * directory, so a delivered image that nobody synced is caught by the suite
 * rather than by a blank space on the page.
 */

/** Slugs of assets present on disk, mapped to their served path. */
export interface PresentAsset {
  readonly src: string;
  readonly width: number;
  readonly height: number;
}

export const PRESENT_ASSETS: Readonly<Record<string, PresentAsset>> = {
  'banner-dental-cta': { src: '/brand/banners/banner-dental-cta.png', width: 2243, height: 701 },
  'banner-dental-hospital': { src: '/brand/banners/banner-dental-hospital.png', width: 2243, height: 701 },
  'dental-lab-custom-appliance': { src: '/brand/services/dental-lab-custom-appliance.png', width: 1254, height: 1254 },
  'iv-sedation': { src: '/brand/services/iv-sedation.png', width: 1254, height: 1254 },
  'night-guard': { src: '/brand/services/night-guard.png', width: 1254, height: 1254 },
  'special-needs-care': { src: '/brand/services/special-needs-care.png', width: 1254, height: 1254 },
  'sports-mouthguard': { src: '/brand/services/sports-mouthguard.png', width: 1254, height: 1254 },
  'temporary-crown': { src: '/brand/services/temporary-crown.png', width: 1254, height: 1254 },
};

/** When the scan last ran, for the audit report. */
export const MANIFEST_GENERATED_AT = '2026-09-09T12:04:03.734Z';

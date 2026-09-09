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
export const PRESENT_ASSETS: Readonly<Record<string, string>> = {
};

/** When the scan last ran, for the audit report. */
export const MANIFEST_GENERATED_AT = '2026-09-09T11:47:39.690Z';

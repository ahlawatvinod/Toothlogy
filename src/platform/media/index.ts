/**
 * TOOTHLOGY IMAGE ASSETS — resolution
 *
 * Answers "is there a photograph for this, and where is it".
 *
 * THE CONTRACT EVERY CALLER RELIES ON
 * `resolveAsset` returns null when the file is not present. Null means render
 * nothing — not a placeholder, not a grey box, not a stock photograph, not an
 * icon standing in for a missing image. A treatment card with no photograph is
 * a card with no photograph; it is not a card with a broken one.
 *
 * That is what lets the registry list seventy assets while the site currently
 * ships zero of them and still looks finished. When the approved files are
 * delivered and `npm run assets:sync` has run, the same components start
 * rendering them with no further change.
 */

import {
  ASSET_BY_SERVICE_SLUG,
  ASSET_BY_SPECIALTY_KEY,
  ASSET_BY_SLUG,
  ASSET_DIMENSIONS,
  IMAGE_ASSETS,
  type ImageAsset,
} from './assets';
import { MANIFEST_GENERATED_AT, PRESENT_ASSETS } from './manifest.generated';

export * from './assets';
export { MANIFEST_GENERATED_AT };

export interface ResolvedAsset {
  readonly slug: string;
  /** Path under /public, ready for `next/image`. */
  readonly src: string;
  readonly alt: string;
  /** Intrinsic size, so space is reserved before the file loads. */
  readonly width: number;
  readonly height: number;
  readonly kind: ImageAsset['kind'];
}

/** True when the approved file has been delivered and the manifest synced. */
export function hasAsset(slug: string): boolean {
  return Object.hasOwn(PRESENT_ASSETS, slug);
}

/**
 * Resolve an asset by slug, or null when it is not available.
 *
 * An unregistered slug also returns null rather than throwing. A typo in a
 * component should leave a gap on a page, not take the page down.
 */
export function resolveAsset(slug: string | undefined | null): ResolvedAsset | null {
  if (!slug) return null;

  const asset = ASSET_BY_SLUG.get(slug);
  const present = PRESENT_ASSETS[slug];
  if (!asset || !present) return null;

  // The delivered file's real dimensions, measured at sync time. The declared
  // per-kind size is only a fallback: a file that is not exactly the nominal
  // size would otherwise make the browser reserve the wrong box, which is the
  // layout shift width/height exist to prevent.
  const fallback = ASSET_DIMENSIONS[asset.kind];
  return {
    slug: asset.slug,
    src: present.src,
    alt: asset.alt,
    width: present.width || fallback.width,
    height: present.height || fallback.height,
    kind: asset.kind,
  };
}

/**
 * Resolve the image illustrating a catalogue treatment.
 *
 * This is the join that keeps components free of hard-coded filenames: a
 * treatment card passes the service slug it already has, and the registry
 * decides which photograph belongs to it.
 */
export function resolveServiceAsset(serviceSlug: string | undefined | null): ResolvedAsset | null {
  if (!serviceSlug) return null;
  const asset = ASSET_BY_SERVICE_SLUG.get(serviceSlug);
  return asset ? resolveAsset(asset.slug) : null;
}

/**
 * Resolve the image nominated to represent a dental specialty.
 *
 * Used by the category grid, where the heading is a specialty rather than a
 * single treatment.
 */
export function resolveSpecialtyAsset(specialtyKey: string | undefined | null): ResolvedAsset | null {
  if (!specialtyKey) return null;
  const asset = ASSET_BY_SPECIALTY_KEY.get(specialtyKey);
  return asset ? resolveAsset(asset.slug) : null;
}

export interface AssetAudit {
  readonly total: number;
  readonly present: readonly string[];
  readonly missing: readonly string[];
  readonly generatedAt: string;
}

/**
 * The §29 audit, as data.
 *
 * Exposed as a function rather than printed by a script alone so that a test,
 * a health check or an admin screen can all ask the same question and get the
 * same answer.
 */
export function auditAssets(): AssetAudit {
  const present: string[] = [];
  const missing: string[] = [];

  for (const asset of IMAGE_ASSETS) {
    (hasAsset(asset.slug) ? present : missing).push(asset.slug);
  }

  return {
    total: IMAGE_ASSETS.length,
    present,
    missing,
    generatedAt: MANIFEST_GENERATED_AT,
  };
}

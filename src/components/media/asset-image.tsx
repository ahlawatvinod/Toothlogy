/**
 * TOOTHLOGY ASSET IMAGES
 *
 * The two ways an approved photograph appears on the site: as a square
 * treatment image, and as a full-width banner.
 *
 * THE RULE THAT SHAPES BOTH COMPONENTS
 * When the approved file is not present, these render `null`. Not a
 * placeholder, not a grey box, not an icon, not a stock photograph. A
 * treatment card with no photograph is simply a card with no photograph, and
 * the layout is built so that reads as deliberate rather than broken.
 *
 * That is what makes the asset registry safe to land before the files do: the
 * site is correct with zero images and correct with all seventy, and the
 * difference is a directory of files plus `npm run assets:sync`.
 *
 * THE SOURCE FILE IS NEVER MODIFIED
 * Everything here is presentation — a container aspect ratio, `object-fit`,
 * rounded corners, a hover scale, a reveal. `next/image` re-encodes for
 * delivery at the requested width, which is the project's existing image
 * pipeline and not an edit to the artwork. No cropping is baked in, no
 * overlay is composited into the file, and nothing is written back.
 */

import NextImage from 'next/image';
import {
  resolveAsset,
  resolveServiceAsset,
  resolveSpecialtyAsset,
  type ResolvedAsset,
} from '@/platform/media';
import { cn } from '@/design-system';

export interface AssetImageProps {
  /** Registry slug. Takes precedence over `serviceSlug` when both are given. */
  readonly slug?: string;
  /** Catalogue service slug, resolved to its illustrating image. */
  readonly serviceSlug?: string;
  /** Dental specialty key, resolved to the image nominated to represent it. */
  readonly specialtyKey?: string;
  /**
   * Override the registry's alt text.
   *
   * Rarely right. The registry describes the image; a caller usually knows the
   * heading beside it, and repeating that heading into alt makes a screen
   * reader announce the same words twice (specification §24).
   */
  readonly alt?: string;
  /**
   * `cover` fills the frame and may crop the edges; `contain` shows the whole
   * image and may letterbox. Neither alters the file.
   */
  readonly fit?: 'cover' | 'contain';
  /** CSS object-position, for steering which part of a crop stays visible. */
  readonly position?: string;
  /**
   * Above the fold. Loads eagerly and is preloaded; everything else is lazy
   * (specification §23). `priority` is deprecated in Next 16, so this maps to
   * `preload`.
   */
  readonly eager?: boolean;
  /** Responsive hint for srcset selection. */
  readonly sizes?: string;
  readonly className?: string;
}

/**
 * A square treatment photograph.
 *
 * The frame holds a 1:1 aspect ratio whether or not the image has loaded, so
 * a card never changes height as photographs arrive — the layout shift the
 * brief asks to avoid (§23) happens at load time, not only on first paint.
 */
export function ServiceImage({
  slug,
  serviceSlug,
  specialtyKey,
  alt,
  fit = 'cover',
  position,
  eager = false,
  sizes = '(max-width: 40rem) 100vw, (max-width: 64rem) 45vw, 22rem',
  className,
}: AssetImageProps) {
  // Most specific first: an explicit slug, then a treatment, then a specialty.
  const asset =
    (slug ? resolveAsset(slug) : null) ??
    resolveServiceAsset(serviceSlug) ??
    resolveSpecialtyAsset(specialtyKey);
  if (!asset) return null;

  return (
    <figure className={cn('tl-asset tl-asset--square', className)}>
      <NextImage
        src={asset.src}
        alt={alt ?? asset.alt}
        width={asset.width}
        height={asset.height}
        sizes={sizes}
        loading={eager ? 'eager' : 'lazy'}
        preload={eager}
        className="tl-asset__img"
        style={{ objectFit: fit, objectPosition: position }}
      />
    </figure>
  );
}

/**
 * A full-width 1920x600 banner.
 *
 * The container keeps the source ratio on wide screens and tightens it on
 * narrow ones, where 1920x600 laid out at 320px would be a 100px-tall strip.
 * `object-position` steers which part survives that crop rather than a second
 * image being cut for mobile — the brief is explicit that no alternative
 * mobile asset is to be produced (§22).
 */
export function BannerImage({
  slug,
  alt,
  eager = false,
  position = 'center',
  className,
  children,
}: AssetImageProps & { readonly children?: React.ReactNode }) {
  const asset = resolveAsset(slug);
  if (!asset) return null;

  return (
    <div className={cn('tl-banner', className)}>
      <NextImage
        src={asset.src}
        alt={alt ?? asset.alt}
        width={asset.width}
        height={asset.height}
        sizes="100vw"
        loading={eager ? 'eager' : 'lazy'}
        preload={eager}
        className="tl-banner__img"
        style={{ objectPosition: position }}
      />
      {/*
       * Overlay content is HTML on top of the image, never composited into it.
       * The scrim is a CSS gradient for text contrast and leaves the file
       * untouched (§22, §14 of the earlier brief).
       */}
      {children ? (
        <>
          <div className="tl-banner__scrim" aria-hidden="true" />
          <div className="tl-banner__content">{children}</div>
        </>
      ) : null}
    </div>
  );
}

/** True when at least one of the given assets is available to render. */
export function anyAssetPresent(slugs: readonly string[]): boolean {
  return slugs.some((slug) => resolveAsset(slug) !== null);
}

export type { ResolvedAsset };

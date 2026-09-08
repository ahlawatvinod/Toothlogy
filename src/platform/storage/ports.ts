/**
 * TOOTHLOGY FILE STORAGE PORTS & DOCUMENT ACCESS
 *
 * Founding spec §17. Toothlogy stores prescriptions, medical records, X-rays,
 * reports, certificates, resumes, vendor and product documents, invoices and
 * warranties.
 *
 * Most of that is the most sensitive data on the platform, so the access model
 * is stated as code rather than as a convention:
 *
 * - **A sensitive object is never publicly addressable.** No guessable URL, no
 *   "unlisted" bucket path. The common breach in health products is a private
 *   file behind a public URL that was assumed to be secret because it was long.
 * - **Access is authorized per request and time-limited.** A signed URL is
 *   minted only after a permission check, and expires in minutes.
 * - **Classification travels with the object**, so retention, redaction and
 *   export tooling can act on it without re-deriving what a file contains.
 *
 * 🟡 PREPARED. Ports and the authorization contract exist; no adapter is
 * registered, so every call throws `NOT_CONFIGURED` (Constitution P10).
 */

import type { Sensitivity } from '@/registry/types';
import { createProviderSlot } from '../integrations/provider';

export interface StoredObjectMetadata {
  readonly key: string;
  readonly contentType: string;
  readonly sizeBytes: number;
  readonly checksum: string;
  readonly uploadedAt: Date;
  readonly sensitivity: Sensitivity;
  /** Owning subject — a user or organization ID. Drives the access decision. */
  readonly ownerId: string;
}

export interface PutObjectInput {
  readonly key: string;
  readonly body: Uint8Array;
  readonly contentType: string;
  readonly sensitivity: Sensitivity;
  readonly ownerId: string;
}

export interface SignedUrl {
  readonly url: string;
  readonly expiresAt: Date;
}

export interface StoragePort {
  put(input: PutObjectInput): Promise<StoredObjectMetadata>;
  get(key: string): Promise<Uint8Array>;
  head(key: string): Promise<StoredObjectMetadata | null>;
  delete(key: string): Promise<void>;

  /**
   * Mint a short-lived download URL.
   *
   * The adapter does not decide *whether* the caller may have it — that is the
   * caller's permission check, made before this is called. This method only
   * bounds how long the granted access lasts.
   */
  signDownloadUrl(key: string, expiresInSeconds: number): Promise<SignedUrl>;

  /** Direct-to-storage upload URL, so large X-rays bypass the application server. */
  signUploadUrl(
    key: string,
    contentType: string,
    expiresInSeconds: number,
  ): Promise<SignedUrl>;
}

export const storageProvider = createProviderSlot<StoragePort>('object storage');

// ---------------------------------------------------------------------------
// Document access policy
// ---------------------------------------------------------------------------

/** How long a signed URL lives, by sensitivity. */
export const SIGNED_URL_TTL_SECONDS: Readonly<Record<Sensitivity, number>> = {
  /** Public assets — logos, product images. Cacheable for an hour. */
  public: 3600,
  internal: 900,
  confidential: 300,
  /**
   * Clinical data gets 60 seconds. Long enough for a browser to start the
   * download, short enough that a URL copied out of a browser history, a chat
   * message or a screenshot is already dead.
   */
  phi: 60,
};

export function signedUrlTtlFor(sensitivity: Sensitivity): number {
  return SIGNED_URL_TTL_SECONDS[sensitivity];
}

/** Can this object be served from a public, unauthenticated URL? */
export function isPubliclyAddressable(sensitivity: Sensitivity): boolean {
  return sensitivity === 'public';
}

/**
 * Content types accepted for clinical uploads.
 *
 * An allow-list, not a deny-list. A deny-list must anticipate every dangerous
 * type; an allow-list only has to name the safe ones. SVG is deliberately
 * excluded despite being an image: it can carry script, making an "image"
 * upload a stored-XSS vector.
 */
export const CLINICAL_UPLOAD_CONTENT_TYPES: readonly string[] = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/tiff',
  'application/pdf',
  'application/dicom',
];

export function isAllowedClinicalUpload(contentType: string): boolean {
  return CLINICAL_UPLOAD_CONTENT_TYPES.includes(contentType.toLowerCase());
}

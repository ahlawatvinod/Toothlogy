/**
 * TOOTHLOGY FILE SERVICE
 *
 * Every stored file — a profile photo, a council certificate, an X-ray, an
 * invoice — goes through here. The storage port moves bytes; this service
 * decides whether bytes may be stored, who may read them, and for how long.
 *
 * WHAT AN UPLOAD MUST SURVIVE
 * 1. **Size** — per purpose, before anything else is done with the bytes.
 * 2. **Type, by content** — the declared Content-Type is attacker-controlled,
 *    so the first bytes are sniffed and must match both the declaration and
 *    the purpose's allow-list. A "photo.jpg" that is really HTML is refused.
 * 3. **Extension** — must agree with the sniffed type, so a download never
 *    opens a file in a different application than its content implies.
 * 4. **Scan** — offered to the malware scanner; unscanned is recorded as such.
 *
 * WHO MAY READ A FILE
 * The owner; members of the owning organization; anyone for PUBLIC purposes;
 * verification reviewers for credential documents; and whatever later phases
 * register (a clinic holding a patient's access grant, an employer reading an
 * applicant's résumé). Rules are registered, not hard-coded here, so a phase
 * that adds a relationship adds the rule that honours it — in one place.
 *
 * Reads are never by URL alone. A download URL is minted per request after the
 * check, signed, and expires in 60 seconds for PHI (see ports.ts).
 */

import { errors } from '../kernel/errors';
import { newId } from '../kernel/ids';
import { db } from '../db/client';
import { recordAuditEvent } from '../audit';
import { logger } from '../observability/logger';
import { can, isAuthenticated, type Principal } from '../rbac';
import { getEnvironment } from '../config';
import type { Sensitivity } from '@/registry/types';
import { signedUrlTtlFor, storageProvider } from './ports';
import { createLocalStorageAdapter } from './local-adapter';
import { malwareScanner } from './scanner';
import { recordGrantReadRule } from '../records/file-rule';
import { resumeReadRule } from '../careers/file-rule';

export type FilePurpose =
  | 'AVATAR'
  | 'ORGANIZATION_LOGO'
  | 'CLINIC_PHOTO'
  | 'DENTIST_CERTIFICATE'
  | 'DENTIST_LICENSE'
  | 'IDENTITY_DOCUMENT'
  | 'STUDENT_DOCUMENT'
  | 'DENTAL_REPORT'
  | 'PRESCRIPTION'
  | 'XRAY'
  | 'CBCT'
  | 'INVOICE'
  | 'AGREEMENT'
  | 'RESUME'
  | 'CERTIFICATE'
  | 'PRODUCT_IMAGE'
  | 'PRODUCT_MANUAL'
  | 'WARRANTY'
  | 'RESEARCH_DOCUMENT'
  | 'CHAT_ATTACHMENT'
  | 'CONTENT_MEDIA'
  | 'OTHER';

// ---------------------------------------------------------------------------
// Content sniffing
// ---------------------------------------------------------------------------

const MB = 1024 * 1024;

const IMAGE = ['image/jpeg', 'image/png', 'image/webp'] as const;
const DOCUMENT = ['application/pdf', ...IMAGE] as const;
const CLINICAL = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/tiff', 'application/dicom'] as const;
const OFFICE = ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'] as const;
const MEDIA = [...IMAGE, 'image/gif', 'video/mp4', 'video/webm'] as const;
const VOICE = ['audio/webm', 'audio/ogg', 'audio/mp4', 'audio/mpeg'] as const;

interface PurposePolicy {
  readonly types: readonly string[];
  readonly maxBytes: number;
  readonly sensitivity: Sensitivity;
}

/**
 * Per-purpose rules. Sensitivity is decided by PURPOSE, never by the uploader:
 * a caller cannot mark an X-ray public by passing a flag.
 */
export const PURPOSE_POLICY: Readonly<Record<FilePurpose, PurposePolicy>> = {
  AVATAR: { types: IMAGE, maxBytes: 5 * MB, sensitivity: 'public' },
  ORGANIZATION_LOGO: { types: IMAGE, maxBytes: 5 * MB, sensitivity: 'public' },
  CLINIC_PHOTO: { types: IMAGE, maxBytes: 10 * MB, sensitivity: 'public' },
  PRODUCT_IMAGE: { types: IMAGE, maxBytes: 10 * MB, sensitivity: 'public' },
  CONTENT_MEDIA: { types: MEDIA, maxBytes: 100 * MB, sensitivity: 'public' },
  DENTIST_CERTIFICATE: { types: DOCUMENT, maxBytes: 15 * MB, sensitivity: 'confidential' },
  DENTIST_LICENSE: { types: DOCUMENT, maxBytes: 15 * MB, sensitivity: 'confidential' },
  IDENTITY_DOCUMENT: { types: DOCUMENT, maxBytes: 15 * MB, sensitivity: 'confidential' },
  STUDENT_DOCUMENT: { types: DOCUMENT, maxBytes: 15 * MB, sensitivity: 'confidential' },
  CERTIFICATE: { types: DOCUMENT, maxBytes: 15 * MB, sensitivity: 'internal' },
  RESUME: { types: OFFICE, maxBytes: 10 * MB, sensitivity: 'confidential' },
  AGREEMENT: { types: OFFICE, maxBytes: 20 * MB, sensitivity: 'confidential' },
  INVOICE: { types: ['application/pdf'], maxBytes: 10 * MB, sensitivity: 'confidential' },
  PRODUCT_MANUAL: { types: ['application/pdf'], maxBytes: 50 * MB, sensitivity: 'public' },
  WARRANTY: { types: DOCUMENT, maxBytes: 15 * MB, sensitivity: 'internal' },
  RESEARCH_DOCUMENT: { types: OFFICE, maxBytes: 50 * MB, sensitivity: 'internal' },
  DENTAL_REPORT: { types: CLINICAL, maxBytes: 50 * MB, sensitivity: 'phi' },
  PRESCRIPTION: { types: DOCUMENT, maxBytes: 15 * MB, sensitivity: 'phi' },
  XRAY: { types: CLINICAL, maxBytes: 100 * MB, sensitivity: 'phi' },
  CBCT: { types: ['application/dicom', 'application/pdf'], maxBytes: 500 * MB, sensitivity: 'phi' },
  CHAT_ATTACHMENT: { types: [...DOCUMENT, ...VOICE], maxBytes: 25 * MB, sensitivity: 'phi' },
  OTHER: { types: ['application/pdf'], maxBytes: 10 * MB, sensitivity: 'confidential' },
};

/** Accepted extensions per sniffed type. */
const EXTENSIONS: Readonly<Record<string, readonly string[]>> = {
  'image/jpeg': ['jpg', 'jpeg'],
  'image/png': ['png'],
  'image/webp': ['webp'],
  'image/gif': ['gif'],
  'image/tiff': ['tif', 'tiff'],
  'application/pdf': ['pdf'],
  'application/dicom': ['dcm', 'dicom'],
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['docx'],
  'video/mp4': ['mp4', 'm4v'],
  'video/webm': ['webm'],
  'audio/webm': ['webm', 'weba'],
  'audio/ogg': ['ogg', 'oga', 'opus'],
  'audio/mp4': ['m4a', 'mp4'],
  'audio/mpeg': ['mp3'],
};

const startsWith = (bytes: Uint8Array, signature: readonly number[], offset = 0) =>
  signature.every((b, i) => bytes[offset + i] === b);

const ascii = (bytes: Uint8Array, start: number, end: number) =>
  String.fromCharCode(...bytes.subarray(start, end));

/**
 * The content type the bytes actually are, or null when unrecognised.
 *
 * Deliberately narrow: only formats Toothlogy accepts are recognised, so an
 * unknown type is a refusal rather than a guess. SVG and HTML are never
 * recognised — both can carry script.
 */
export function sniffContentType(bytes: Uint8Array, declared: string): string | null {
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return 'image/jpeg';
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png';
  if (ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 12) === 'WEBP') return 'image/webp';
  if (ascii(bytes, 0, 6) === 'GIF87a' || ascii(bytes, 0, 6) === 'GIF89a') return 'image/gif';
  if (startsWith(bytes, [0x49, 0x49, 0x2a, 0x00]) || startsWith(bytes, [0x4d, 0x4d, 0x00, 0x2a])) return 'image/tiff';
  if (ascii(bytes, 0, 5) === '%PDF-') return 'application/pdf';
  if (bytes.length > 132 && ascii(bytes, 128, 132) === 'DICM') return 'application/dicom';
  if (startsWith(bytes, [0x50, 0x4b, 0x03, 0x04])) {
    // A ZIP container. Only the Word format is accepted, and only when it was
    // declared as such; the OOXML marker file confirms the container kind.
    const head = ascii(bytes, 0, Math.min(bytes.length, 2048));
    if (head.includes('[Content_Types].xml') || head.includes('word/')) {
      return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    }
    return null;
  }
  if (startsWith(bytes, [0x1a, 0x45, 0xdf, 0xa3])) {
    // WebM/Matroska: audio or video is not distinguishable from the header
    // alone, so the declaration decides between the two WebM types only.
    return declared.startsWith('audio/') ? 'audio/webm' : 'video/webm';
  }
  if (ascii(bytes, 0, 4) === 'OggS') return 'audio/ogg';
  if (ascii(bytes, 4, 8) === 'ftyp') {
    return declared.startsWith('audio/') || ascii(bytes, 8, 12) === 'M4A ' ? 'audio/mp4' : 'video/mp4';
  }
  if (ascii(bytes, 0, 3) === 'ID3' || startsWith(bytes, [0xff, 0xfb]) || startsWith(bytes, [0xff, 0xf3])) {
    return 'audio/mpeg';
  }
  return null;
}

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/**
 * Install the configured storage adapter, once. Called by every file
 * operation, so server components and jobs get storage without depending on a
 * route handler having run first.
 */
export function ensureStorageConfigured(): void {
  if (storageProvider.isConfigured()) return;
  if (process.env.STORAGE_PROVIDER === 'local') {
    storageProvider.set(createLocalStorageAdapter(process.env.STORAGE_LOCAL_DIR || '.data/storage'));
  }
}

/** Scanning is mandatory in production unless explicitly turned off. */
export function isScanRequired(): boolean {
  const flag = process.env.FILE_SCAN_REQUIRED;
  if (flag === 'true') return true;
  if (flag === 'false') return false;
  return getEnvironment() === 'production';
}

// ---------------------------------------------------------------------------
// Access rules
// ---------------------------------------------------------------------------

export interface FileRow {
  readonly id: string;
  readonly ownerUserId: string | null;
  readonly ownerOrganizationId: string | null;
  readonly purpose: string;
  readonly sensitivity: string;
  readonly status: string;
  readonly scanStatus: string;
}

/** A later phase's reason a principal may read a file (an access grant, …). */
export type FileReadRule = (principal: Principal, file: FileRow) => Promise<boolean>;

const readRules: FileReadRule[] = [];

export function registerFileReadRule(rule: FileReadRule): void {
  if (!readRules.includes(rule)) readRules.push(rule);
}

// Phase 6: a practice under a patient's active grant reads that record's files.
registerFileReadRule(recordGrantReadRule);
// Phase 8: an employer reads the résumé on an application to its posting.
registerFileReadRule(resumeReadRule);

const CREDENTIAL_PURPOSES = new Set(['DENTIST_CERTIFICATE', 'DENTIST_LICENSE', 'IDENTITY_DOCUMENT', 'STUDENT_DOCUMENT']);

export async function canReadFile(principal: Principal, file: FileRow): Promise<boolean> {
  if (file.status === 'DELETED' || file.status === 'PURGED') return false;
  if (file.sensitivity === 'PUBLIC') return true;
  if (!isAuthenticated(principal)) return false;

  if (file.ownerUserId === principal.userId) return true;
  if (file.ownerOrganizationId && can(principal, 'tl.core.organization.read', { organizationId: file.ownerOrganizationId })) {
    return true;
  }
  // Reviewers must see the certificate they are verifying. Nothing clinical.
  if (CREDENTIAL_PURPOSES.has(file.purpose) && can(principal, 'tl.verification.request.review')) return true;
  // Organization and clinic-claim evidence (registration certificates,
  // agreements) is readable by a reviewer only while a request awaiting a
  // decision cites it — not every certificate on the platform, and not after
  // the decision is made.
  if (can(principal, 'tl.verification.request.review')) {
    const cited = await db().verificationRequest.count({
      where: {
        status: { in: ['PENDING', 'IN_REVIEW'] },
        submittedEvidence: { path: ['documents'], array_contains: [{ fileId: file.id }] },
      },
    });
    if (cited > 0) return true;
  }

  for (const rule of readRules) {
    if (await rule(principal, file)) return true;
  }
  return false;
}

async function canManageFile(principal: Principal, file: FileRow): Promise<boolean> {
  if (!isAuthenticated(principal)) return false;
  if (file.ownerUserId === principal.userId) return true;
  return Boolean(
    file.ownerOrganizationId &&
      can(principal, 'tl.core.organization.manage', { organizationId: file.ownerOrganizationId }),
  );
}

async function logAccess(
  fileId: string,
  actor: string,
  action: 'UPLOAD' | 'SIGN_URL' | 'DOWNLOAD' | 'DELETE' | 'PURGE',
  outcome: 'SUCCESS' | 'FAILURE' | 'DENIED',
  ipAddress?: string | null,
): Promise<void> {
  try {
    await db().fileAccessLog.create({
      data: { id: newId('fileAccess'), fileId, actor, action, outcome, ipAddress: ipAddress ?? null },
    });
  } catch (error) {
    logger.warn('Failed to log file access', { fileId, action, error });
  }
}

// ---------------------------------------------------------------------------
// Upload
// ---------------------------------------------------------------------------

export interface UploadInput {
  readonly principal: Principal;
  readonly purpose: FilePurpose;
  readonly filename: string;
  readonly declaredType: string;
  readonly bytes: Uint8Array;
  /** Set when the file belongs to an organization rather than the uploader. */
  readonly organizationId?: string;
  /**
   * The person the file belongs to when that is not the uploader — a practice
   * adding an X-ray to a patient's record. Set only by a service that has
   * already authorized writing into that person's record.
   */
  readonly ownerUserId?: string;
  readonly ipAddress?: string | null;
  readonly requestId?: string;
}

export interface UploadedFile {
  readonly id: string;
  readonly purpose: FilePurpose;
  readonly contentType: string;
  readonly sizeBytes: number;
  readonly sensitivity: Sensitivity;
  readonly status: 'ACTIVE' | 'QUARANTINED';
  readonly scanStatus: 'CLEAN' | 'SCANNER_NOT_CONFIGURED';
}

const SENSITIVITY_TO_DB = { public: 'PUBLIC', internal: 'INTERNAL', confidential: 'CONFIDENTIAL', phi: 'PHI' } as const;

export async function uploadFile(input: UploadInput): Promise<UploadedFile> {
  if (!isAuthenticated(input.principal)) throw errors.unauthenticated();
  const policy = PURPOSE_POLICY[input.purpose];
  if (!policy) throw errors.validation('Unknown file purpose.', { field: 'purpose' });

  if (input.organizationId && !can(input.principal, 'tl.core.organization.manage', { organizationId: input.organizationId })) {
    throw errors.forbidden('tl.core.organization.manage');
  }

  if (input.bytes.byteLength === 0) throw errors.validation('The file is empty.', { field: 'file' });
  if (input.bytes.byteLength > policy.maxBytes) {
    throw errors.validation(`That file is too large. The limit is ${Math.round(policy.maxBytes / MB)} MB.`, {
      field: 'file',
      maxBytes: policy.maxBytes,
    });
  }

  const sniffed = sniffContentType(input.bytes, input.declaredType.toLowerCase());
  if (!sniffed || !policy.types.includes(sniffed)) {
    throw errors.validation('That file type is not accepted here.', {
      field: 'file',
      accepted: policy.types,
    });
  }
  // The declaration must agree with the content. A mismatch is either a broken
  // client or a disguise, and neither should be stored.
  const declared = input.declaredType.toLowerCase().split(';')[0]!.trim();
  if (declared && declared !== 'application/octet-stream' && declared !== sniffed) {
    throw errors.validation('The file’s content does not match its declared type.', { field: 'file' });
  }

  const extension = input.filename.toLowerCase().split('.').pop() ?? '';
  if (!(EXTENSIONS[sniffed] ?? []).includes(extension)) {
    throw errors.validation('The file extension does not match its content.', { field: 'file' });
  }

  // Scan before anything is stored under a usable status.
  let scanStatus: UploadedFile['scanStatus'] = 'SCANNER_NOT_CONFIGURED';
  if (malwareScanner.isConfigured()) {
    const scan = await malwareScanner.get().scan(input.bytes, input.filename);
    if (!scan.clean) {
      await recordAuditEvent({
        action: 'FILE_UPLOAD_BLOCKED',
        actor: input.principal.userId,
        subject: input.filename,
        outcome: 'denied',
        requestId: input.requestId,
        detail: { finding: scan.finding ?? 'unspecified', engine: scan.engine },
      });
      throw errors.validation('This file was blocked by the malware scanner.', { field: 'file' });
    }
    scanStatus = 'CLEAN';
  }
  const status: UploadedFile['status'] = scanStatus === 'CLEAN' || !isScanRequired() ? 'ACTIVE' : 'QUARANTINED';

  ensureStorageConfigured();
  const id = newId('file');
  const now = new Date();
  const storageKey = `${input.purpose.toLowerCase().replace(/_/g, '-')}/${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, '0')}/${id.toLowerCase()}`;

  const stored = await storageProvider.get().put({
    key: storageKey,
    body: input.bytes,
    contentType: sniffed,
    sensitivity: policy.sensitivity,
    ownerId: input.organizationId ?? input.ownerUserId ?? input.principal.userId,
  });

  await db().fileObject.create({
    data: {
      id,
      storageKey,
      contentType: sniffed,
      sizeBytes: stored.sizeBytes,
      checksum: stored.checksum,
      sensitivity: SENSITIVITY_TO_DB[policy.sensitivity],
      ownerUserId: input.organizationId ? null : (input.ownerUserId ?? input.principal.userId),
      ownerOrganizationId: input.organizationId ?? null,
      // The client's filename is kept for display only, never used as a path.
      originalFilename: input.filename.slice(0, 200),
      purpose: input.purpose,
      status,
      scanStatus,
      scannedAt: scanStatus === 'CLEAN' ? now : null,
    },
  });

  await logAccess(id, input.principal.userId, 'UPLOAD', 'SUCCESS', input.ipAddress);
  await recordAuditEvent({
    action: 'FILE_UPLOADED',
    actor: input.principal.userId,
    subject: id,
    outcome: 'success',
    organizationId: input.organizationId,
    requestId: input.requestId,
    detail: { purpose: input.purpose, sizeBytes: stored.sizeBytes, status, scanStatus },
  });

  return {
    id,
    purpose: input.purpose,
    contentType: sniffed,
    sizeBytes: stored.sizeBytes,
    sensitivity: policy.sensitivity,
    status,
    scanStatus,
  };
}

// ---------------------------------------------------------------------------
// Read, sign, delete, purge
// ---------------------------------------------------------------------------

async function loadFile(fileId: string) {
  const file = await db().fileObject.findUnique({ where: { id: fileId } });
  if (!file || file.deletedAt) throw errors.notFound('File');
  return file;
}

/** Metadata, for a principal allowed to read the file. */
export async function getFileMetadata(principal: Principal, fileId: string) {
  const file = await loadFile(fileId);
  // Not-found rather than forbidden: whether a file id exists is itself
  // information a stranger should not get.
  if (!(await canReadFile(principal, file))) throw errors.notFound('File');
  return {
    id: file.id,
    purpose: file.purpose,
    contentType: file.contentType,
    sizeBytes: file.sizeBytes,
    sensitivity: file.sensitivity,
    status: file.status,
    scanStatus: file.scanStatus,
    originalFilename: file.originalFilename,
    createdAt: file.createdAt,
  };
}

/** Mint a short-lived download URL, after the authorization check. */
export async function createDownloadUrl(
  principal: Principal,
  fileId: string,
  context: { ipAddress?: string | null } = {},
): Promise<{ url: string; expiresAt: Date }> {
  const file = await loadFile(fileId);
  const actor = isAuthenticated(principal) ? principal.userId : 'anonymous';

  if (!(await canReadFile(principal, file))) {
    await logAccess(file.id, actor, 'SIGN_URL', 'DENIED', context.ipAddress);
    throw errors.notFound('File');
  }
  if (file.status === 'QUARANTINED') {
    throw errors.preconditionFailed('This file is awaiting a malware scan and cannot be opened yet.');
  }
  if (file.scanStatus === 'INFECTED') throw errors.preconditionFailed('This file was blocked by the malware scanner.');

  ensureStorageConfigured();
  const ttl = signedUrlTtlFor(file.sensitivity.toLowerCase() as Sensitivity);
  const signed = await storageProvider.get().signDownloadUrl(file.storageKey, ttl);
  await logAccess(file.id, actor, 'SIGN_URL', 'SUCCESS', context.ipAddress);
  return signed;
}

/** Bytes for a verified signed URL. The signature was checked by the caller. */
export async function readByStorageKey(
  storageKey: string,
  context: { ipAddress?: string | null } = {},
): Promise<{ bytes: Uint8Array; contentType: string; filename: string | null; sensitivity: string; fileId: string }> {
  const file = await db().fileObject.findUnique({ where: { storageKey } });
  if (!file || file.deletedAt || file.status !== 'ACTIVE') throw errors.notFound('File');
  ensureStorageConfigured();
  const bytes = await storageProvider.get().get(storageKey);
  await logAccess(file.id, 'signed-url', 'DOWNLOAD', 'SUCCESS', context.ipAddress);
  return {
    bytes,
    contentType: file.contentType,
    filename: file.originalFilename,
    sensitivity: file.sensitivity,
    fileId: file.id,
  };
}

/** Bytes of a PUBLIC file, served without a signature. */
export async function readPublicFile(fileId: string) {
  const file = await db().fileObject.findUnique({ where: { id: fileId } });
  if (!file || file.deletedAt || file.status !== 'ACTIVE' || file.sensitivity !== 'PUBLIC') {
    throw errors.notFound('File');
  }
  ensureStorageConfigured();
  return { bytes: await storageProvider.get().get(file.storageKey), contentType: file.contentType };
}

/** Retention after the owner deletes a file, by purpose. */
const RETENTION_DAYS: Readonly<Partial<Record<FilePurpose, number>>> = {
  INVOICE: 6 * 365,
  AGREEMENT: 6 * 365,
  PRESCRIPTION: 3 * 365,
  DENTAL_REPORT: 3 * 365,
  XRAY: 3 * 365,
  CBCT: 3 * 365,
};

export async function deleteFile(
  principal: Principal,
  fileId: string,
  context: { ipAddress?: string | null; requestId?: string } = {},
): Promise<{ retainUntil: Date }> {
  const file = await loadFile(fileId);
  if (!(await canManageFile(principal, file))) {
    if (isAuthenticated(principal)) await logAccess(file.id, principal.userId, 'DELETE', 'DENIED', context.ipAddress);
    throw errors.notFound('File');
  }

  const now = new Date();
  const days = RETENTION_DAYS[file.purpose as FilePurpose] ?? 0;
  const retainUntil = new Date(now.getTime() + days * 24 * 3600 * 1000);
  const actor = isAuthenticated(principal) ? principal.userId : 'anonymous';

  await db().fileObject.update({
    where: { id: file.id },
    data: { status: 'DELETED', deletedAt: now, retainUntil, deletedByUserId: actor },
  });
  await logAccess(file.id, actor, 'DELETE', 'SUCCESS', context.ipAddress);
  await recordAuditEvent({
    action: 'FILE_DELETED',
    actor,
    subject: file.id,
    outcome: 'success',
    requestId: context.requestId,
    detail: { purpose: file.purpose, retainUntil: retainUntil.toISOString() },
  });
  return { retainUntil };
}

/** Remove the bytes of deleted files whose retention has passed. A job. */
export async function purgeDeletedFiles(limit = 100): Promise<{ purged: number; failed: number }> {
  ensureStorageConfigured();
  if (!storageProvider.isConfigured()) return { purged: 0, failed: 0 };

  const due = await db().fileObject.findMany({
    where: { status: 'DELETED', OR: [{ retainUntil: null }, { retainUntil: { lte: new Date() } }] },
    take: limit,
  });

  let purged = 0;
  let failed = 0;
  for (const file of due) {
    try {
      await storageProvider.get().delete(file.storageKey);
      await db().fileObject.update({ where: { id: file.id }, data: { status: 'PURGED' } });
      await logAccess(file.id, 'system:purge', 'PURGE', 'SUCCESS');
      purged += 1;
    } catch (error) {
      failed += 1;
      logger.error('File purge failed', { fileId: file.id, error });
    }
  }
  return { purged, failed };
}

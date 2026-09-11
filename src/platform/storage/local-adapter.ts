/**
 * TOOTHLOGY LOCAL DISK STORAGE ADAPTER
 *
 * A real implementation of the storage port that keeps bytes on the server's
 * own disk. Selected with `STORAGE_PROVIDER=local`.
 *
 * HONEST LIMITS
 * - Single node only. Behind a load balancer each instance sees a different
 *   disk; use an object-storage adapter there.
 * - No direct-to-storage upload: `signUploadUrl` is NOT_IMPLEMENTED, and files
 *   are uploaded through the API instead (which is where validation happens
 *   anyway).
 * - Durability is whatever the disk provides. Back it up.
 *
 * SAFETY
 * Keys are validated against a strict grammar and resolved inside the root, so
 * no key can escape it (`../../etc/passwd`). The directory must be outside the
 * public web root: nothing here is ever served statically. Downloads go through
 * the signed content route, which checks the signature and the file's state.
 */

import { createHash } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { errors } from '../kernel/errors';
import { sign } from '../security/crypto';
import type { PutObjectInput, SignedUrl, StoragePort, StoredObjectMetadata } from './ports';

/** Lower-case segments of letters, digits, `_`, `-`, `.`; no leading dot; no `..`. */
const KEY_PATTERN = /^[a-z0-9][a-z0-9_-]*(\/[a-z0-9][a-z0-9_.-]*)*$/;

export function isValidStorageKey(key: string): boolean {
  return key.length <= 300 && KEY_PATTERN.test(key) && !key.includes('..');
}

/**
 * The payload a signed content URL covers. Shared by the adapter that signs
 * and the route that verifies, so the two cannot disagree about the format.
 */
export function signedUrlPayload(key: string, expiresAtSeconds: number): string {
  return `${key}:${expiresAtSeconds}`;
}

export function createLocalStorageAdapter(rootDir: string): StoragePort {
  const root = path.resolve(rootDir);

  const resolveKey = (key: string): string => {
    if (!isValidStorageKey(key)) throw errors.validation('Invalid storage key.');
    const full = path.resolve(root, key);
    if (!full.startsWith(root + path.sep)) throw errors.validation('Invalid storage key.');
    return full;
  };

  const metaPath = (full: string) => `${full}.meta.json`;

  return {
    async put(input: PutObjectInput): Promise<StoredObjectMetadata> {
      const full = resolveKey(input.key);
      await mkdir(path.dirname(full), { recursive: true });

      const metadata: StoredObjectMetadata = {
        key: input.key,
        contentType: input.contentType,
        sizeBytes: input.body.byteLength,
        checksum: createHash('sha256').update(input.body).digest('hex'),
        uploadedAt: new Date(),
        sensitivity: input.sensitivity,
        ownerId: input.ownerId,
      };

      // `wx`: never overwrite. Keys contain a random id, so a collision means
      // a bug, and silently replacing another object's bytes is the worst way
      // to find out.
      await writeFile(full, input.body, { flag: 'wx' });
      await writeFile(metaPath(full), JSON.stringify(metadata), { flag: 'wx' });
      return metadata;
    },

    async get(key: string): Promise<Uint8Array> {
      try {
        return new Uint8Array(await readFile(resolveKey(key)));
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') throw errors.notFound('Stored object');
        throw error;
      }
    },

    async head(key: string): Promise<StoredObjectMetadata | null> {
      try {
        const raw = JSON.parse(await readFile(metaPath(resolveKey(key)), 'utf8')) as StoredObjectMetadata;
        return { ...raw, uploadedAt: new Date(raw.uploadedAt) };
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
        throw error;
      }
    },

    async delete(key: string): Promise<void> {
      const full = resolveKey(key);
      await rm(full, { force: true });
      await rm(metaPath(full), { force: true });
    },

    async signDownloadUrl(key: string, expiresInSeconds: number): Promise<SignedUrl> {
      resolveKey(key);
      const expiresAtSeconds = Math.floor(Date.now() / 1000) + expiresInSeconds;
      const signature = sign(signedUrlPayload(key, expiresAtSeconds), 'signed-file-url');
      const params = new URLSearchParams({ k: key, e: String(expiresAtSeconds), s: signature });
      return {
        url: `/api/v1/files/content?${params.toString()}`,
        expiresAt: new Date(expiresAtSeconds * 1000),
      };
    },

    async signUploadUrl(): Promise<SignedUrl> {
      throw errors.notImplemented('Direct-to-storage upload with the local adapter');
    },
  };
}

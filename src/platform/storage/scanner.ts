/**
 * TOOTHLOGY MALWARE SCANNING PORT
 *
 * Every upload is offered to a scanner before it becomes usable. No scanner
 * adapter ships with the platform (ClamAV, a cloud AV API — each is a
 * deployment decision), so the slot is empty by default and the upload is
 * recorded as SCANNER_NOT_CONFIGURED: never as CLEAN. Whether an unscanned
 * file may be used is a policy decision (`FILE_SCAN_REQUIRED`), made
 * explicitly rather than by a scanner that silently says yes.
 */

import { createProviderSlot } from '../integrations/provider';

export interface ScanResult {
  readonly clean: boolean;
  /** Signature or rule name when not clean. */
  readonly finding?: string;
  readonly engine: string;
}

export interface MalwareScannerPort {
  scan(bytes: Uint8Array, filename: string): Promise<ScanResult>;
}

export const malwareScanner = createProviderSlot<MalwareScannerPort>('malware scanner');

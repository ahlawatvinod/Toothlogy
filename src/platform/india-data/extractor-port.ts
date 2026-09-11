/**
 * TOOTHLOGY EXTRACTOR PORT
 *
 * Automatic collection of dentist, clinic, hospital and college records from
 * an external source (a licensed directory API, a data vendor) for a district.
 * No source is connected: the slot is NOT_CONFIGURED and every call rejects.
 * Nothing is ever scraped or invented in its place. Files supplied by an
 * operator are imported through `importExtractionBatch` today.
 *
 * An adapter returns raw rows exactly as the source provides them; the
 * extraction service keeps them untouched beside their normalized form.
 */

import { createProviderSlot } from '../integrations/provider';
import type { ExtractionEntityKind } from './normalize';

export interface ExtractionRequest {
  readonly entityType: ExtractionEntityKind;
  readonly countryCode: string;
  readonly stateName: string;
  readonly districtName: string;
  /** Resume token from the previous page, if any. */
  readonly cursor?: string;
}

export interface ExtractionPage {
  /** The source's name, recorded on the batch ("vendor:<name>"). */
  readonly source: string;
  readonly sourceReference: string | null;
  readonly extractedAt: Date;
  readonly rows: ReadonlyArray<Readonly<Record<string, string | number | null>>>;
  readonly nextCursor: string | null;
}

export interface ExtractorPort {
  extract(request: ExtractionRequest): Promise<ExtractionPage>;
}

export const extractorProvider = createProviderSlot<ExtractorPort>('data extractor');

/**
 * TOOTHLOGY AI PORT
 *
 * Language-model inference behind a port, like every other external system.
 * No model is connected: the slot is NOT_CONFIGURED and every call rejects with
 * that error, so no screen ever shows text a model did not write (Constitution
 * P10). What may be asked of a model, and what it may be shown, is decided in
 * the AI service under the AI covenant (Constitution §5) — never by the
 * adapter.
 */

import { createProviderSlot } from '../integrations/provider';

/** The only things Toothlogy asks a model to do. Never a diagnosis. */
export type AiPurpose = 'ARTICLE_SUMMARY' | 'ARTICLE_TRANSLATION';

export interface AiRequest {
  readonly purpose: AiPurpose;
  /** Fixed server-side per purpose; never user-supplied. */
  readonly instruction: string;
  /** The material to work on — only ever public, reviewed content. */
  readonly input: string;
  readonly maxOutputTokens: number;
  /** BCP 47 language for the answer. */
  readonly locale: string;
}

export interface AiResult {
  readonly text: string;
  /** The provider's model identifier, recorded with the audit event. */
  readonly model: string;
  readonly inputTokens?: number;
  readonly outputTokens?: number;
}

export interface AiPort {
  complete(request: AiRequest): Promise<AiResult>;
}

export const aiProvider = createProviderSlot<AiPort>('AI model');

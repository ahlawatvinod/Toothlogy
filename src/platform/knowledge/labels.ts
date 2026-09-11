/**
 * Labels for knowledge articles, shared by the service and the browser forms
 * (no server imports, so client components may use it).
 */

export const ARTICLE_KINDS = [
  ['CONDITION', 'Condition'],
  ['TREATMENT', 'Treatment'],
  ['PROCEDURE', 'Procedure'],
  ['GUIDE', 'Guide'],
  ['BLOG', 'Blog post'],
] as const;

export const ARTICLE_KIND_LABEL: Readonly<Record<string, string>> = Object.fromEntries(ARTICLE_KINDS);

/** Kinds that explain clinical matters: they must cite at least one source. */
export const CLINICAL_KINDS: ReadonlySet<string> = new Set(['CONDITION', 'TREATMENT', 'PROCEDURE', 'GUIDE']);

export const ARTICLE_STATUS_LABEL: Readonly<Record<string, string>> = {
  DRAFT: 'Draft',
  IN_REVIEW: 'With a reviewer',
  CHANGES_REQUESTED: 'Changes requested',
  PUBLISHED: 'Published',
  ARCHIVED: 'Archived',
};

export interface Citation {
  readonly title: string;
  readonly source: string;
  readonly year?: number;
  readonly url?: string;
}

/** Words per minute for the reading-time estimate. */
export function readingMinutes(body: string): number {
  return Math.max(1, Math.round(body.trim().split(/\s+/).length / 200));
}

/**
 * TOOTHLOGY TREATMENT DESCRIPTIONS
 *
 * Deciding which of four possible descriptions a patient actually reads.
 *
 * THE CHAIN (specification §10), most specific first:
 *
 *   1. the dentist's own wording for this VARIANT
 *   2. the dentist's own wording for the SERVICE
 *   3. the master catalogue's wording for the VARIANT
 *   4. the master catalogue's wording for the SERVICE
 *
 * WHY A CHAIN RATHER THAN A COPY
 * The obvious alternative is to seed every dentist's row with the master text
 * and let them edit it. That looks simpler and is worse in two ways: correcting
 * a clinically misleading sentence in the catalogue would fix it for nobody,
 * because every clinic holds a stale copy; and the platform could no longer
 * tell "this clinic wrote this" from "this clinic never touched it", which is
 * exactly the distinction §9 requires. Resolving at read time keeps one
 * editable source per level and one obvious answer to "who wrote this".
 *
 * A DENTIST'S EDIT NEVER REACHES THE MASTER RECORD.
 * That is enforced by the columns, not by this function: `customDescription`
 * lives on the dentist's own rows, and no dentist-facing code path writes to
 * `CatalogueService` or `ServiceVariant` at all.
 *
 * WHAT COUNTS AS "PRESENT"
 * Whitespace is not a description. A dentist who clears the field leaves an
 * empty string rather than a null, and treating that as content would show a
 * blank paragraph where the master text should have appeared.
 */

/** Where a resolved description came from. Surfaced so the UI can label it. */
export type DescriptionSource =
  | 'dentist_variant'
  | 'dentist_service'
  | 'master_variant'
  | 'master_service'
  | 'none';

export interface ResolvedDescription {
  readonly text: string | null;
  readonly source: DescriptionSource;
  /** True when the text was written by the clinic rather than by Toothlogy. */
  readonly isCustom: boolean;
}

export interface DescriptionSources {
  readonly dentistVariant?: string | null;
  readonly dentistService?: string | null;
  readonly masterVariant?: string | null;
  readonly masterService?: string | null;
}

function usable(value: string | null | undefined): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

export function resolveDescription(sources: DescriptionSources): ResolvedDescription {
  if (usable(sources.dentistVariant)) {
    return { text: sources.dentistVariant.trim(), source: 'dentist_variant', isCustom: true };
  }
  if (usable(sources.dentistService)) {
    return { text: sources.dentistService.trim(), source: 'dentist_service', isCustom: true };
  }
  if (usable(sources.masterVariant)) {
    return { text: sources.masterVariant.trim(), source: 'master_variant', isCustom: false };
  }
  if (usable(sources.masterService)) {
    return { text: sources.masterService.trim(), source: 'master_service', isCustom: false };
  }
  // Null rather than a placeholder string. The caller decides whether this is
  // an empty state with a "Add description" action (the dentist's dashboard) or
  // simply an omitted paragraph (the patient's page); a sentinel here would
  // force both to render the same thing.
  return { text: null, source: 'none', isCustom: false };
}

/**
 * The one-line form, for a table cell or a card.
 *
 * Falls back through the same chain, then to the long description truncated on
 * a word boundary. Truncation is last on purpose: a purpose-written short
 * description is a sentence, and a cut-off one ends mid-clause — which on a
 * treatment description can change what it appears to say.
 */
export function resolveShortDescription(
  sources: DescriptionSources & {
    readonly masterVariantShort?: string | null;
    readonly masterServiceShort?: string | null;
  },
  maxLength = 120,
): ResolvedDescription {
  const short = resolveDescription({
    dentistVariant: sources.dentistVariant,
    dentistService: sources.dentistService,
    masterVariant: sources.masterVariantShort,
    masterService: sources.masterServiceShort,
  });
  if (short.text && short.text.length <= maxLength) return short;

  const long = short.text ? short : resolveDescription(sources);
  if (!long.text) return long;
  if (long.text.length <= maxLength) return long;

  return { ...long, text: truncateOnWord(long.text, maxLength) };
}

function truncateOnWord(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  const cut = text.slice(0, maxLength);
  const lastSpace = cut.lastIndexOf(' ');
  // A term with no space in the first `maxLength` characters is left alone
  // rather than sliced through the middle of a word.
  return `${(lastSpace > maxLength * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}

/**
 * Validation shared by every write path.
 *
 * The upper bound is generous but real: a description is a paragraph on a
 * treatment page, not an article, and without a ceiling one clinic's essay
 * breaks the layout of every card that renders it.
 */
export const DESCRIPTION_MAX = 2000;
export const SHORT_DESCRIPTION_MAX = 200;

export function validateDescription(
  value: string | null | undefined,
  field: string,
  max = DESCRIPTION_MAX,
): { readonly field: string; readonly message: string } | null {
  if (value === null || value === undefined) return null;
  if (value.length > max) {
    return {
      field,
      message: `Keep this under ${max} characters. It is ${value.length} at the moment.`,
    };
  }
  return null;
}

/**
 * Normalise a description on the way in.
 *
 * An empty or whitespace-only string becomes null, so "cleared by the dentist"
 * and "never set" are the same state in the database. Without this the
 * fallback chain would stop at an empty string and render nothing where the
 * master description should have appeared.
 */
export function normalizeDescription(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

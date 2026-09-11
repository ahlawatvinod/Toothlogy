/**
 * Labels for the dental record, shared by the service and the browser forms
 * (no server imports here, so client components may use it).
 */

export const ENTRY_KINDS = [
  ['TREATMENT', 'Treatment'],
  ['VISIT_NOTE', 'Visit note'],
  ['IMAGING', 'X-ray or scan'],
  ['REPORT', 'Report'],
  ['DOCUMENT', 'Other document'],
] as const;

export const ENTRY_KIND_LABEL: Readonly<Record<string, string>> = Object.fromEntries(ENTRY_KINDS);

/** Kinds that are a file first: the form asks for one. */
export const FILE_KINDS: ReadonlySet<string> = new Set(['IMAGING', 'REPORT', 'DOCUMENT']);

export const GRANT_DURATIONS = [
  ['30', '30 days'],
  ['365', 'One year'],
  ['0', 'Until I withdraw it'],
] as const;

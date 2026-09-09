/**
 * TOOTHLOGY TREATMENT SEARCH
 *
 * Matching what a patient types against what a clinician calls it.
 *
 * THE PROBLEM THIS SOLVES
 * Patients do not search in clinical vocabulary. They type "RCT", "cap",
 * "teeth cleaning", "braces". A catalogue that only matches "Root Canal
 * Treatment", "Crown", "Oral Prophylaxis / Scaling" and "Self-Ligating Braces"
 * returns nothing for all four — and the patient concludes the clinic does not
 * do it, which is a discovery failure caused purely by terminology.
 *
 * NORMALISATION IS STORED, NOT COMPUTED PER QUERY
 * `normalize` runs once when a synonym is written and its result is indexed.
 * Doing it in the query instead would mean a sequential scan with a function
 * call per row on every keystroke of a type-ahead.
 *
 * DELIBERATELY NOT FUZZY
 * No edit distance, no stemming, no phonetics. On a health catalogue a fuzzy
 * match that turns "extraction" into "retraction" is worse than no match: the
 * patient does not know it guessed. Prefix and substring matching over a
 * curated synonym list is predictable, and a missing term is fixed by adding
 * the synonym, which is a data change rather than a tuning exercise.
 */

/**
 * Reduce a term to its comparable form: lower-case, no punctuation, single
 * spaces. "X-Ray", "x ray" and "xray" all become "x ray" → "xray".
 */
export function normalize(term: string): string {
  return term
    .toLowerCase()
    .normalize('NFKD')
    // Strip combining marks so "à" matches "a".
    .replace(/[̀-ͯ]/g, '')
    // Punctuation and separators become nothing at all rather than a space, so
    // "x-ray" and "xray" collapse to the same token.
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** The same, with spaces removed too. "root canal" → "rootcanal". */
export function normalizeTight(term: string): string {
  return normalize(term).replace(/\s/g, '');
}

export interface SearchableService {
  readonly id: string;
  readonly name: string;
  readonly categoryName?: string;
  readonly synonyms: readonly string[];
  readonly variantNames?: readonly string[];
}

export interface SearchMatch<T extends SearchableService> {
  readonly service: T;
  /** Higher is better. Only meaningful relative to other results of one query. */
  readonly score: number;
  /** Which text matched, so the UI can show why a result is there. */
  readonly matchedOn: string;
}

/**
 * Score one service against a normalised query.
 *
 * The ladder is exact name → name prefix → exact synonym → synonym prefix →
 * name substring → synonym substring → variant → category. It is ordered by how
 * confident each kind of match is, so "crown" puts the Crown service above
 * "Stainless-Steel Crown", which is what a patient means.
 */
function scoreService(
  service: SearchableService,
  query: string,
  tight: string,
): SearchMatch<SearchableService> | null {
  const name = normalize(service.name);
  const nameTight = normalizeTight(service.name);

  // An exact name match is the only unambiguous win, and returns immediately.
  //
  // A name PREFIX deliberately does not: it has to compete with the synonyms
  // below, or "RCT" ranks "RCT + Crown Package" — which merely starts with the
  // letters — above "Root Canal Treatment", for which "RCT" is the exact term
  // every patient and dentist actually uses.
  if (name === query || nameTight === tight) {
    return { service, score: 100, matchedOn: service.name };
  }

  // Everything else is collected and the best taken at the end. Gathering
  // candidates rather than tracking a running maximum in a closure keeps the
  // scoring readable and each rule independent of the order it is written in.
  const candidates: SearchMatch<SearchableService>[] = [];

  if (name.startsWith(query) || nameTight.startsWith(tight)) {
    candidates.push({ service, score: 90, matchedOn: service.name });
  }

  for (const synonym of service.synonyms) {
    const value = normalize(synonym);
    const valueTight = normalizeTight(synonym);
    if (value === query || valueTight === tight) {
      // Above the name-prefix score below. An exact hit on a curated synonym
      // is a stronger signal than being the prefix of a longer name: typing
      // "RCT" means Root Canal Treatment, not "RCT + Crown Package".
      candidates.push({ service, score: 95, matchedOn: synonym });
    } else if (value.startsWith(query) || valueTight.startsWith(tight)) {
      candidates.push({ service, score: 70, matchedOn: synonym });
    } else if (value.split(' ').some((word) => word.startsWith(query))) {
      // Word-boundary, not `includes`. A bare substring test matches "own"
      // against the synonym "crown", which is noise the patient cannot
      // explain and cannot get rid of.
      candidates.push({ service, score: 50, matchedOn: synonym });
    }
  }

  // A word-boundary match inside the name is a real hit — "canal" in "Root
  // Canal Treatment".
  //
  // There is deliberately no arbitrary-substring fallback here. It would match
  // "own" against "Crown" and "ant" against "Implant", which is noise a patient
  // cannot explain and cannot escape. Vocabulary that is not a word of the name
  // belongs in the synonym list, where it is curated.
  if (name.split(' ').some((word) => word.startsWith(query))) {
    candidates.push({ service, score: 60, matchedOn: service.name });
  }

  for (const variantName of service.variantNames ?? []) {
    const value = normalize(variantName);
    if (value === query) candidates.push({ service, score: 55, matchedOn: variantName });
    else if (value.startsWith(query)) {
      candidates.push({ service, score: 35, matchedOn: variantName });
    }
  }

  if (service.categoryName) {
    const value = normalize(service.categoryName);
    if (value.startsWith(query)) {
      candidates.push({ service, score: 20, matchedOn: service.categoryName });
    }
  }

  if (candidates.length === 0) return null;

  return candidates.reduce((best, candidate) =>
    candidate.score > best.score ? candidate : best,
  );
}

/**
 * Rank services against a free-text query.
 *
 * An empty query returns everything in the order given, rather than nothing —
 * a price list with a search box should show the list before you type in it.
 */
export function searchServices<T extends SearchableService>(
  services: readonly T[],
  rawQuery: string,
): readonly SearchMatch<T>[] {
  const query = normalize(rawQuery);
  if (!query) {
    return services.map((service) => ({ service, score: 0, matchedOn: service.name }));
  }

  const tight = normalizeTight(rawQuery);
  const matches: SearchMatch<T>[] = [];

  for (const service of services) {
    const match = scoreService(service, query, tight);
    if (match) matches.push({ ...match, service });
  }

  // Ties break alphabetically so the order is stable between identical queries.
  // An unstable ranking makes a list appear to shuffle itself as you type.
  return matches.sort(
    (a, b) => b.score - a.score || a.service.name.localeCompare(b.service.name),
  );
}

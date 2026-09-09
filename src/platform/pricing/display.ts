/**
 * TOOTHLOGY PRICE DISPLAY
 *
 * Turns a stored price row into exactly one rendered answer, deterministically.
 *
 * WHY THIS IS A MODULE AND NOT A FEW LINES IN A COMPONENT
 * A price row can carry a minimum, a maximum, a firm price, a discounted
 * price, a package price and an "ask us" flag, in any combination. Left to each
 * surface, the dentist's dashboard, the patient's price list, the search result
 * and the future quotation would each pick their own precedence — and a patient
 * would be shown one number on a card and a different one on the page it links
 * to. Every surface calls this.
 *
 * THE PRECEDENCE, IN ORDER (specification §26)
 *
 *   1. custom quote          → "Custom quote"           nothing else is shown
 *   2. discounted + regular  → discounted, regular struck through
 *   3. discounted alone      → the discounted figure
 *   4. a firm price          → that figure
 *   5. minimum and maximum   → a range
 *   6. minimum alone         → "Starting from …"
 *   7. maximum alone         → "Up to …"
 *   8. nothing               → "Contact clinic"
 *
 * Rule 1 comes first on purpose. A treatment flagged as needing a quote must
 * never be rendered as a number, even if a stale minimum is still stored on the
 * row — that stale figure is precisely what a patient would take as the price.
 *
 * IT RETURNS A STRUCTURE, NOT A STRING
 * A discounted price needs the old price struck through, a range needs two
 * figures, and a suffix like "/tooth" belongs to the unit rather than the
 * amount. Returning a string would force every caller to parse it back apart.
 */

import { formatMoney, money, type Money } from '../money';

/** Which of the eight cases above applies. */
export type PriceDisplayKind =
  | 'custom_quote'
  | 'discounted'
  | 'exact'
  | 'range'
  | 'from'
  | 'up_to'
  | 'on_request';

export interface PriceDisplay {
  readonly kind: PriceDisplayKind;
  /** The figure a patient reads, already formatted. Null for the two non-numeric kinds. */
  readonly primary: string | null;
  /** The pre-discount figure, to be struck through. Null unless kind is 'discounted'. */
  readonly strikethrough: string | null;
  /** The upper figure of a range. Null unless kind is 'range'. */
  readonly rangeEnd: string | null;
  /** Suffix from the pricing unit, e.g. "/tooth". Empty where a suffix reads badly. */
  readonly unitLabel: string;
  /**
   * True where the source range has no real ceiling. The UI appends a "+" —
   * "₹10,000–₹40,000+" — rather than implying a maximum that does not exist.
   */
  readonly openEnded: boolean;
  /** Complete, ready to render as one line. Provided for logs, exports and alt text. */
  readonly text: string;
}

export interface PriceDisplayInput {
  readonly minMinor?: bigint | null;
  readonly maxMinor?: bigint | null;
  readonly actualMinor?: bigint | null;
  readonly discountedMinor?: bigint | null;
  readonly packageMinor?: bigint | null;
  readonly currency: string;
  readonly isCustomQuote?: boolean;
  readonly openEnded?: boolean;
  /** From PriceUnit.shortLabel. */
  readonly unitLabel?: string;
  readonly locale?: string;
}

const CUSTOM_QUOTE_TEXT = 'Custom quote';
/**
 * Deliberately not "Price on request", which reads as though a price exists and
 * is being withheld. "Contact clinic" says what to do next.
 */
const ON_REQUEST_TEXT = 'Contact clinic';

function present(value: bigint | null | undefined): value is bigint {
  // Zero is a real price — a free consultation — and must survive this check.
  // `value ? …` would drop it, which is the classic falsy-zero bug and here it
  // would turn "free" into "contact clinic".
  return value !== null && value !== undefined;
}

function format(amount: bigint, currency: string, locale: string): string {
  return formatMoney(money(amount, currency), locale);
}

export function describePrice(input: PriceDisplayInput): PriceDisplay {
  const {
    minMinor,
    maxMinor,
    actualMinor,
    discountedMinor,
    packageMinor,
    currency,
    isCustomQuote = false,
    openEnded = false,
    unitLabel = '',
    locale = 'en-IN',
  } = input;

  const base = { unitLabel, openEnded } as const;
  const fmt = (amount: bigint) => format(amount, currency, locale);
  const withUnit = (text: string) => (unitLabel ? `${text} ${unitLabel}` : text);
  const plus = (text: string) => (openEnded ? `${text}+` : text);

  // 1. Custom quote wins over every stored figure.
  if (isCustomQuote) {
    return {
      ...base,
      kind: 'custom_quote',
      primary: null,
      strikethrough: null,
      rangeEnd: null,
      openEnded: false,
      text: CUSTOM_QUOTE_TEXT,
    };
  }

  // A package price is the firm price of a package row, so it takes the same
  // slot as `actualMinor`. `actualMinor` still wins if both are set, because a
  // price entered against the row itself is the more specific statement.
  const firm = present(actualMinor) ? actualMinor : present(packageMinor) ? packageMinor : null;

  // 2 & 3. A discount is only a discount if there is something to discount
  // from. With no regular price it is simply the price, and showing a
  // strikethrough against nothing invents a saving.
  if (present(discountedMinor)) {
    const hasRegular = present(firm) && firm > discountedMinor;
    return {
      ...base,
      kind: 'discounted',
      primary: fmt(discountedMinor),
      strikethrough: hasRegular ? fmt(firm) : null,
      rangeEnd: null,
      openEnded: false,
      text: hasRegular
        ? withUnit(`${fmt(discountedMinor)} (was ${fmt(firm)})`)
        : withUnit(fmt(discountedMinor)),
    };
  }

  // 4. A firm price.
  if (present(firm)) {
    return {
      ...base,
      kind: 'exact',
      primary: fmt(firm),
      strikethrough: null,
      rangeEnd: null,
      openEnded: false,
      text: withUnit(fmt(firm)),
    };
  }

  // 5. A range.
  if (present(minMinor) && present(maxMinor)) {
    // A single-value range is a firm price wearing a range's clothes.
    // Rendering "₹5,000–₹5,000" makes a clinic look careless.
    if (minMinor === maxMinor && !openEnded) {
      return {
        ...base,
        kind: 'exact',
        primary: fmt(minMinor),
        strikethrough: null,
        rangeEnd: null,
        openEnded: false,
        text: withUnit(fmt(minMinor)),
      };
    }

    return {
      ...base,
      kind: 'range',
      primary: fmt(minMinor),
      strikethrough: null,
      rangeEnd: fmt(maxMinor),
      text: withUnit(plus(`${fmt(minMinor)}–${fmt(maxMinor)}`)),
    };
  }

  // 6. A floor only.
  if (present(minMinor)) {
    return {
      ...base,
      kind: 'from',
      primary: fmt(minMinor),
      strikethrough: null,
      rangeEnd: null,
      text: withUnit(`Starting from ${fmt(minMinor)}`),
    };
  }

  // 7. A ceiling only. Unusual, but storable, and "up to" is the only honest
  // reading of it.
  if (present(maxMinor)) {
    return {
      ...base,
      kind: 'up_to',
      primary: fmt(maxMinor),
      strikethrough: null,
      rangeEnd: null,
      text: withUnit(`Up to ${fmt(maxMinor)}`),
    };
  }

  // 8. Nothing was set.
  return {
    ...base,
    kind: 'on_request',
    primary: null,
    strikethrough: null,
    rangeEnd: null,
    openEnded: false,
    text: ON_REQUEST_TEXT,
  };
}

/**
 * Render a master catalogue range.
 *
 * ALWAYS LABELLED, NEVER BARE.
 * The label is not decoration. A market range shown next to a clinic's name,
 * without a label, reads as that clinic's price — which is a number no dentist
 * agreed to and no patient should plan around (specification §13).
 */
export function describeSuggestedRange(input: {
  readonly minMinor?: bigint | null;
  readonly maxMinor?: bigint | null;
  readonly currency: string;
  readonly openEnded?: boolean;
  readonly isCustomQuote?: boolean;
  readonly locale?: string;
}): { readonly label: string; readonly value: string } | null {
  const display = describePrice({
    minMinor: input.minMinor,
    maxMinor: input.maxMinor,
    currency: input.currency,
    openEnded: input.openEnded,
    isCustomQuote: input.isCustomQuote,
    locale: input.locale,
  });

  // Nothing useful to say. Returning null lets the caller omit the row rather
  // than print "Suggested range: Contact clinic", which says nothing.
  if (display.kind === 'on_request') return null;

  return { label: 'Suggested range', value: display.text };
}

/** The Money value a caller should treat as "the price", for sorting and totals. */
export function effectiveAmount(input: PriceDisplayInput): Money | null {
  if (input.isCustomQuote) return null;
  const candidate =
    input.discountedMinor ?? input.actualMinor ?? input.packageMinor ?? input.minMinor ?? null;
  return candidate === null || candidate === undefined
    ? null
    : money(candidate, input.currency);
}

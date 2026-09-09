'use client';

/**
 * Price list editor.
 *
 * DESKTOP IS A TABLE, MOBILE IS CARDS — NOT A SQUEEZED TABLE.
 * Both are rendered from the same data and the same handlers, and CSS decides
 * which is visible. A table narrowed to 360px is unreadable, and a horizontally
 * scrolling one hides the price column, which is the only column anybody came
 * for (specification §21).
 *
 * WHAT THIS COMPONENT DOES NOT DO
 * It does not compute a price, decide precedence, or format a figure. All of
 * that is `platform/pricing/display`, already applied on the server. This file
 * renders what it was given and posts edits back. Duplicating the rules here is
 * how the dashboard and the patient page start disagreeing about what a
 * treatment costs.
 */

import { useMemo, useState } from 'react';
import { Alert, Badge, Button, Field, Icon, Input } from '@/design-system';
import { api } from '@/lib/api-client';
import { searchServices } from '@/platform/pricing/search';
import type { PriceDisplay } from '@/platform/pricing/display';

export interface CatalogueOption {
  readonly slug: string;
  readonly name: string;
  readonly shortDescription: string | null;
  readonly description: string | null;
  readonly categoryName: string;
  readonly categorySlug: string;
  readonly defaultUnitKey: string;
  readonly isCustomQuote: boolean;
  readonly synonyms: readonly string[];
  readonly variants: ReadonlyArray<{ slug: string; name: string }>;
  readonly suggested: { label: string; value: string } | null;
}

export interface VariantView {
  readonly variantSlug: string | null;
  readonly variantName: string | null;
  /** Resolved through the four-level chain; may be Toothlogy's or the clinic's. */
  readonly description?: { text: string | null; isCustom: boolean };
  /** What this clinic actually typed, which is what the editor shows. */
  readonly customDescription?: string | null;
  readonly unitKey: string;
  readonly currency: string;
  readonly isCustomQuote: boolean;
  readonly isEnabled: boolean;
  readonly minMinor: string;
  readonly maxMinor: string;
  readonly actualMinor: string;
  readonly discountedMinor: string;
  readonly display: PriceDisplay;
}

export interface PriceRowView {
  readonly id: string;
  readonly serviceSlug: string;
  readonly serviceName: string;
  readonly categoryName: string;
  readonly locationId: string | null;
  readonly locationName: string | null;
  readonly isEnabled: boolean;
  readonly isPublicVisible: boolean;
  readonly note: string | null;
  readonly description?: { text: string | null; isCustom: boolean };
  readonly customDescription?: string | null;
  readonly suggested: { label: string; value: string } | null;
  readonly variants: readonly VariantView[];
}

export interface UnitOption {
  readonly key: string;
  readonly name: string;
  readonly shortLabel: string;
}

export interface PriceListClientProps {
  readonly catalogue: readonly CatalogueOption[];
  readonly units: readonly UnitOption[];
  readonly clinics: ReadonlyArray<{ id: string; name: string }>;
  readonly initialRows: readonly PriceRowView[];
}

/** Rupees typed by a dentist → paise. Empty stays empty. */
function toMinor(major: string): string | null {
  const trimmed = major.trim();
  if (!trimmed) return null;
  if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) return null;
  const [whole, fraction = ''] = trimmed.split('.');
  return `${whole}${fraction.padEnd(2, '0')}`;
}

function toMajor(minor: string): string {
  if (!minor) return '';
  const value = BigInt(minor);
  const whole = value / 100n;
  const paise = value % 100n;
  return paise === 0n ? whole.toString() : `${whole}.${paise.toString().padStart(2, '0')}`;
}

interface EditorState {
  readonly serviceSlug: string;
  readonly locationId: string | null;
  readonly isPublicVisible: boolean;
  readonly note: string;
  /** Empty means "use Toothlogy's description", not "no description". */
  readonly customDescription: string;
  readonly variants: Array<{
    variantSlug: string | null;
    variantName: string;
    unitKey: string;
    price: string;
    discounted: string;
    min: string;
    max: string;
    isCustomQuote: boolean;
    customDescription: string;
  }>;
}

export function PriceListClient({ catalogue, units, clinics, initialRows }: PriceListClientProps) {
  const [rows, setRows] = useState<readonly PriceRowView[]>(initialRows);
  const [query, setQuery] = useState('');
  const [clinicFilter, setClinicFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'hidden'>('all');
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [requestId, setRequestId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  /*
   * Inline editing of My Price.
   *
   * Keyed by row id and variant so only the cell being edited is in an editing
   * state — a single boolean would put every row into edit mode at once. The
   * saving, error and saved states are per-cell for the same reason: a dentist
   * changing one price should not see the whole table say "saving".
   */
  const [inline, setInline] = useState<{
    key: string;
    value: string;
    state: 'editing' | 'saving' | 'error';
    message?: string;
  } | null>(null);

  const inlineKey = (rowId: string, variantSlug: string | null) =>
    `${rowId}:${variantSlug ?? '_base'}`;

  async function saveInline(row: PriceRowView, variant: VariantView) {
    if (!inline) return;
    const minor = toMinor(inline.value);

    if (minor === null) {
      setInline({ ...inline, state: 'error', message: 'Enter an amount, for example 12000.' });
      return;
    }

    setInline({ ...inline, state: 'saving' });

    // The whole treatment is sent, not just the one field: the PUT replaces a
    // treatment's prices as a unit, so omitting the untouched variants would
    // delete them.
    const result = await api.put<{ servicePriceId: string; changes: number }>(
      '/api/v1/dentists/me/price-list',
      {
        serviceSlug: row.serviceSlug,
        locationId: row.locationId,
        isPublicVisible: row.isPublicVisible,
        note: row.note,
        variants: row.variants.map((existing) => ({
          variantSlug: existing.variantSlug,
          unitKey: existing.unitKey,
          currency: existing.currency,
          isCustomQuote: existing.isCustomQuote,
          actualMinor:
            existing.variantSlug === variant.variantSlug
              ? minor
              : existing.actualMinor || null,
          discountedMinor: existing.discountedMinor || null,
          minMinor: existing.minMinor || null,
          maxMinor: existing.maxMinor || null,
        })),
      },
    );

    if (!result.ok) {
      setInline({ ...inline, state: 'error', message: result.message });
      setRequestId(result.requestId);
      return;
    }

    setInline(null);
    setNotice('Price updated.');
    await refresh();
  }

  async function refresh() {
    const refreshed = await api.get<{ rows: PriceRowView[] }>('/api/v1/dentists/me/price-list');
    if (refreshed.ok) setRows(refreshed.data.rows as unknown as PriceRowView[]);
  }

  const visibleRows = useMemo(() => {
    let result = rows;

    if (clinicFilter !== 'all') {
      result = result.filter((row) =>
        clinicFilter === 'global' ? row.locationId === null : row.locationId === clinicFilter,
      );
    }

    if (statusFilter !== 'all') {
      result = result.filter((row) =>
        statusFilter === 'active' ? row.isEnabled && row.isPublicVisible : !row.isPublicVisible || !row.isEnabled,
      );
    }

    if (query.trim()) {
      // The same ranking AND the same synonyms the patient-facing search uses.
      //
      // The synonyms are looked up from the catalogue rather than left empty:
      // without them a dentist searching their own list for "RCT" or "cap"
      // finds nothing, while a patient searching the identical term finds the
      // treatment. The dentist would reasonably conclude it is not on their
      // list and add it a second time.
      const synonymsBySlug = new Map(
        catalogue.map((option) => [option.slug, option.synonyms]),
      );

      const matches = searchServices(
        result.map((row) => ({
          id: row.id,
          name: row.serviceName,
          categoryName: row.categoryName,
          synonyms: synonymsBySlug.get(row.serviceSlug) ?? [],
          variantNames: row.variants.map((v) => v.variantName ?? ''),
        })),
        query,
      );
      const order = new Map(matches.map((match, index) => [match.service.id, index]));
      result = result
        .filter((row) => order.has(row.id))
        .sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
    }

    return result;
  }, [rows, query, clinicFilter, statusFilter, catalogue]);

  const catalogueMatches = useMemo(() => {
    if (!query.trim()) return [];
    const priced = new Set(rows.map((row) => `${row.serviceSlug}:${row.locationId ?? ''}`));
    return searchServices(
      catalogue.map((option) => ({
        id: option.slug,
        name: option.name,
        categoryName: option.categoryName,
        synonyms: option.synonyms,
        variantNames: option.variants.map((variant) => variant.name),
      })),
      query,
    )
      .filter((match) => !priced.has(`${match.service.id}:`))
      .slice(0, 6)
      .map((match) => catalogue.find((option) => option.slug === match.service.id)!)
      .filter(Boolean);
  }, [catalogue, rows, query]);

  function openEditor(option: CatalogueOption, existing?: PriceRowView) {
    setError(null);
    setNotice(null);
    setEditor({
      serviceSlug: option.slug,
      locationId: existing?.locationId ?? null,
      isPublicVisible: existing?.isPublicVisible ?? true,
      note: existing?.note ?? '',
      // The clinic's OWN text, never the resolved text. Pre-filling the box
      // with Toothlogy's description would make a dentist who saves an
      // untouched form silently adopt it as their own — and stop receiving
      // corrections to it.
      customDescription: existing?.customDescription ?? '',
      variants:
        option.variants.length > 0
          ? option.variants.map((variant) => {
              const current = existing?.variants.find((v) => v.variantSlug === variant.slug);
              return {
                variantSlug: variant.slug,
                variantName: variant.name,
                unitKey: current?.unitKey ?? option.defaultUnitKey,
                price: toMajor(current?.actualMinor ?? ''),
                discounted: toMajor(current?.discountedMinor ?? ''),
                min: toMajor(current?.minMinor ?? ''),
                max: toMajor(current?.maxMinor ?? ''),
                isCustomQuote: current?.isCustomQuote ?? false,
                customDescription: current?.customDescription ?? '',
              };
            })
          : [
              {
                variantSlug: null,
                variantName: option.name,
                unitKey: existing?.variants[0]?.unitKey ?? option.defaultUnitKey,
                price: toMajor(existing?.variants[0]?.actualMinor ?? ''),
                discounted: toMajor(existing?.variants[0]?.discountedMinor ?? ''),
                min: toMajor(existing?.variants[0]?.minMinor ?? ''),
                max: toMajor(existing?.variants[0]?.maxMinor ?? ''),
                isCustomQuote: existing?.variants[0]?.isCustomQuote ?? option.isCustomQuote,
                customDescription: existing?.variants[0]?.customDescription ?? '',
              },
            ],
    });
  }

  async function save() {
    if (!editor) return;
    setBusy(true);
    setError(null);

    // Variants the dentist left entirely blank are not sent. Sending them would
    // create empty rows that render as "Contact clinic" on a public page,
    // which reads as a treatment they offer but will not price.
    const filled = editor.variants.filter(
      (variant) => variant.isCustomQuote || variant.price || variant.min || variant.max,
    );

    if (filled.length === 0) {
      setError('Enter at least one price, or mark a variant as a custom quote.');
      setBusy(false);
      return;
    }

    const result = await api.put<{ servicePriceId: string; changes: number }>(
      '/api/v1/dentists/me/price-list',
      {
        serviceSlug: editor.serviceSlug,
        locationId: editor.locationId,
        isPublicVisible: editor.isPublicVisible,
        note: editor.note.trim() || null,
        // Empty string sent as null, so clearing the box restores the master
        // description rather than publishing a blank one.
        customDescription: editor.customDescription.trim() || null,
        variants: filled.map((variant) => ({
          variantSlug: variant.variantSlug,
          unitKey: variant.unitKey,
          currency: 'INR',
          isCustomQuote: variant.isCustomQuote,
          actualMinor: variant.isCustomQuote ? null : toMinor(variant.price),
          discountedMinor: variant.isCustomQuote ? null : toMinor(variant.discounted),
          minMinor: variant.isCustomQuote ? null : toMinor(variant.min),
          maxMinor: variant.isCustomQuote ? null : toMinor(variant.max),
          customDescription: variant.customDescription.trim() || null,
        })),
      },
    );

    setBusy(false);

    if (!result.ok) {
      setError(result.message);
      setRequestId(result.requestId);
      return;
    }

    setEditor(null);
    setNotice(`Saved. ${result.data.changes} price change${result.data.changes === 1 ? '' : 's'} recorded.`);
    // Reload from the server rather than patching local state: the server owns
    // the resolved display string and the resolved description, and
    // reconstructing either here is exactly the duplication this component is
    // written to avoid.
    await refresh();
  }

  const option = editor ? catalogue.find((entry) => entry.slug === editor.serviceSlug) : null;

  return (
    <div className="tl-pricelist">
      {notice ? (
        <Alert tone="success" title="Price list updated">
          {notice}
        </Alert>
      ) : null}

      <div className="tl-pricelist__toolbar">
        <Field label="Search treatments" hint="Try “RCT”, “cap” or “braces”.">
          {(props) => (
            <Input
              {...props}
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search your list and the catalogue"
            />
          )}
        </Field>

        <Field label="Clinic">
          {(props) => (
            <select
              {...props}
              className="tl-input"
              value={clinicFilter}
              onChange={(event) => setClinicFilter(event.target.value)}
            >
              <option value="all">All</option>
              <option value="global">General price list</option>
              {clinics.map((clinic) => (
                <option key={clinic.id} value={clinic.id}>
                  {clinic.name}
                </option>
              ))}
            </select>
          )}
        </Field>

        <Field label="Status">
          {(props) => (
            <select
              {...props}
              className="tl-input"
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value as typeof statusFilter)}
            >
              <option value="all">All</option>
              <option value="active">Published</option>
              <option value="hidden">Hidden or disabled</option>
            </select>
          )}
        </Field>
      </div>

      {catalogueMatches.length > 0 ? (
        <section className="tl-pricelist__suggest" aria-label="Treatments you have not priced yet">
          <h2 className="tl-pricelist__suggest-title">Not on your list yet</h2>
          <ul className="tl-pricelist__suggest-list">
            {catalogueMatches.map((match) => (
              <li key={match.slug}>
                <button type="button" className="tl-chip" onClick={() => openEditor(match)}>
                  <Icon name="sparkles" />
                  {match.name}
                  <span className="tl-chip__meta">{match.suggested?.value ?? 'Custom quote'}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {rows.length === 0 ? (
        <div className="tl-empty">
          <h2 className="tl-empty__title">You have not priced anything yet</h2>
          <p className="tl-empty__text">
            Search the catalogue above and set a price for the treatments you offer. Patients see
            only what you publish.
          </p>
        </div>
      ) : visibleRows.length === 0 ? (
        <div className="tl-empty">
          <h2 className="tl-empty__title">Nothing matches those filters</h2>
          <p className="tl-empty__text">Clear the search or change the clinic and status filters.</p>
        </div>
      ) : (
        <>
          {/* Desktop */}
          <div
            className="tl-table__scroll tl-pricelist__table"
            tabIndex={0}
            role="region"
            aria-label="Your prices"
          >
            <table className="tl-table">
              <caption className="tl-visually-hidden">Your treatment prices</caption>
              <thead>
                <tr>
                  <th scope="col">Treatment</th>
                  <th scope="col">Variant</th>
                  {/* Suggested comes BEFORE My Price and is styled down, so the
                      dentist's own figure is the one the eye lands on (§23). */}
                  <th scope="col">Suggested India price</th>
                  <th scope="col" className="tl-pricelist__myprice-col">
                    My Price
                  </th>
                  <th scope="col">Status</th>
                  <th scope="col">
                    <span className="tl-visually-hidden">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {visibleRows.flatMap((row) =>
                  row.variants.map((variant, index) => {
                    const key = inlineKey(row.id, variant.variantSlug);
                    const editing = inline?.key === key;

                    return (
                      <tr key={key}>
                        {index === 0 ? (
                          <th scope="row" rowSpan={row.variants.length}>
                            <span className="tl-pricelist__service">{row.serviceName}</span>
                            <span className="tl-pricelist__category">{row.categoryName}</span>
                            {row.description?.text ? (
                              <span className="tl-pricelist__desc">
                                {row.description.text}
                                {row.description.isCustom ? (
                                  <span className="tl-pricelist__desc-tag">Your wording</span>
                                ) : null}
                              </span>
                            ) : (
                              <span className="tl-pricelist__desc tl-pricelist__desc--empty">
                                Description not added
                              </span>
                            )}
                          </th>
                        ) : null}

                        <td>{variant.variantName ?? '—'}</td>

                        {index === 0 ? (
                          <td rowSpan={row.variants.length} className="tl-pricelist__suggested">
                            {row.suggested ? row.suggested.value : '—'}
                          </td>
                        ) : null}

                        <td className="tl-pricelist__myprice">
                          {editing ? (
                            <InlinePriceEditor
                              value={inline.value}
                              state={inline.state}
                              message={inline.message}
                              onChange={(value) => setInline({ ...inline, value, state: 'editing' })}
                              onCancel={() => setInline(null)}
                              onSave={() => saveInline(row, variant)}
                            />
                          ) : (
                            <MyPriceCell
                              variant={variant}
                              onEdit={() =>
                                setInline({
                                  key,
                                  value: toMajor(variant.actualMinor),
                                  state: 'editing',
                                })
                              }
                            />
                          )}
                        </td>

                        {index === 0 ? (
                          <td rowSpan={row.variants.length}>
                            {row.isPublicVisible && row.isEnabled ? (
                              <Badge tone="success">Published</Badge>
                            ) : (
                              <Badge tone="neutral">Hidden</Badge>
                            )}
                          </td>
                        ) : null}

                        {index === 0 ? (
                          <td rowSpan={row.variants.length}>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                const match = catalogue.find((c) => c.slug === row.serviceSlug);
                                if (match) openEditor(match, row);
                              }}
                            >
                              Edit
                            </Button>
                          </td>
                        ) : null}
                      </tr>
                    );
                  }),
                )}
              </tbody>
            </table>
          </div>

          {/* Mobile — an intentionally different layout, not the table squeezed. */}
          <ul className="tl-pricelist__cards">
            {visibleRows.map((row) => (
              <li key={row.id} className="tl-pricecard">
                <div className="tl-pricecard__head">
                  <div>
                    <h3 className="tl-pricecard__title">{row.serviceName}</h3>
                    <p className="tl-pricecard__category">{row.categoryName}</p>
                  </div>
                  {row.isPublicVisible && row.isEnabled ? (
                    <Badge tone="success">Published</Badge>
                  ) : (
                    <Badge tone="neutral">Hidden</Badge>
                  )}
                </div>

                {row.description?.text ? (
                  <p className="tl-pricecard__desc">{row.description.text}</p>
                ) : (
                  <p className="tl-pricecard__desc tl-pricelist__desc--empty">
                    Description not added
                  </p>
                )}

                {row.suggested ? (
                  <p className="tl-pricecard__suggested">
                    {row.suggested.label}: {row.suggested.value}
                  </p>
                ) : null}

                <dl className="tl-pricecard__prices">
                  {row.variants.map((variant) => (
                    <div key={variant.variantSlug ?? 'base'}>
                      <dt>{variant.variantName ?? 'My Price'}</dt>
                      <dd>
                        <MyPriceCell
                          variant={variant}
                          onEdit={() => {
                            const match = catalogue.find((c) => c.slug === row.serviceSlug);
                            if (match) openEditor(match, row);
                          }}
                        />
                      </dd>
                    </div>
                  ))}
                </dl>

                <p className="tl-pricecard__meta">{row.locationName ?? 'All clinics'}</p>

                <div className="tl-pricecard__actions">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      const match = catalogue.find((c) => c.slug === row.serviceSlug);
                      if (match) openEditor(match, row);
                    }}
                  >
                    Edit price
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      const match = catalogue.find((c) => c.slug === row.serviceSlug);
                      if (match) openEditor(match, row);
                    }}
                  >
                    Edit description
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}

      {editor && option ? (
        <div className="tl-drawer" role="dialog" aria-modal="true" aria-labelledby="editor-title">
          <div className="tl-drawer__panel">
            <div className="tl-drawer__header">
              <h2 id="editor-title" className="tl-drawer__title">
                {option.name}
              </h2>
              <Button variant="ghost" size="sm" onClick={() => setEditor(null)}>
                Close
              </Button>
            </div>

            <div className="tl-drawer__body">
              {option.suggested ? (
                <p className="tl-drawer__suggested">
                  {/* Labelled AND explicitly read-only. A bare range here would
                      read as the dentist's own price the moment it is copied
                      elsewhere, and the master range is not theirs to edit
                      (specification §7). */}
                  <strong>Suggested India price:</strong> {option.suggested.value}
                  <span className="tl-drawer__readonly">Set by Toothlogy · read only</span>
                </p>
              ) : null}

              {error ? (
                <Alert tone="danger" title="Could not save">
                  {error}
                  {requestId ? (
                    <>
                      {' '}
                      <span className="tl-form__reference">Reference: {requestId}</span>
                    </>
                  ) : null}
                </Alert>
              ) : null}

              {clinics.length > 0 ? (
                <Field
                  label="Applies to"
                  hint="A clinic price overrides your general price at that clinic only."
                >
                  {(props) => (
                    <select
                      {...props}
                      className="tl-input"
                      value={editor.locationId ?? ''}
                      onChange={(event) =>
                        setEditor({ ...editor, locationId: event.target.value || null })
                      }
                    >
                      <option value="">All clinics (general price)</option>
                      {clinics.map((clinic) => (
                        <option key={clinic.id} value={clinic.id}>
                          {clinic.name}
                        </option>
                      ))}
                    </select>
                  )}
                </Field>
              ) : null}

              <fieldset className="tl-fieldset">
                <legend className="tl-fieldset__legend">Prices</legend>
                <div className="tl-variant-grid">
                  {editor.variants.map((variant, index) => (
                    <div className="tl-variant" key={variant.variantSlug ?? 'base'}>
                      <p className="tl-variant__name">{variant.variantName}</p>

                      <label className="tl-checkbox">
                        <input
                          type="checkbox"
                          checked={variant.isCustomQuote}
                          onChange={(event) => {
                            const next = [...editor.variants];
                            next[index] = { ...variant, isCustomQuote: event.target.checked };
                            setEditor({ ...editor, variants: next });
                          }}
                        />
                        <span>Quote on examination</span>
                      </label>

                      {!variant.isCustomQuote ? (
                        <div className="tl-variant__fields">
                          <Field label="Your price (₹)">
                            {(props) => (
                              <Input
                                {...props}
                                inputMode="decimal"
                                value={variant.price}
                                onChange={(event) => {
                                  const next = [...editor.variants];
                                  next[index] = { ...variant, price: event.target.value };
                                  setEditor({ ...editor, variants: next });
                                }}
                              />
                            )}
                          </Field>
                          <Field label="Discounted (₹)" hint="Optional.">
                            {(props) => (
                              <Input
                                {...props}
                                inputMode="decimal"
                                value={variant.discounted}
                                onChange={(event) => {
                                  const next = [...editor.variants];
                                  next[index] = { ...variant, discounted: event.target.value };
                                  setEditor({ ...editor, variants: next });
                                }}
                              />
                            )}
                          </Field>
                          <Field label="Unit">
                            {(props) => (
                              <select
                                {...props}
                                className="tl-input"
                                value={variant.unitKey}
                                onChange={(event) => {
                                  const next = [...editor.variants];
                                  next[index] = { ...variant, unitKey: event.target.value };
                                  setEditor({ ...editor, variants: next });
                                }}
                              >
                                {units.map((unit) => (
                                  <option key={unit.key} value={unit.key}>
                                    {unit.name}
                                  </option>
                                ))}
                              </select>
                            )}
                          </Field>
                        </div>
                      ) : null}

                      <Field
                        label={`Description for ${variant.variantName}`}
                        hint="Optional. Leave empty to use Toothlogy's description."
                      >
                        {(props) => (
                          <textarea
                            {...props}
                            className="tl-input tl-textarea"
                            rows={2}
                            value={variant.customDescription}
                            onChange={(event) => {
                              const next = [...editor.variants];
                              next[index] = {
                                ...variant,
                                customDescription: event.target.value,
                              };
                              setEditor({ ...editor, variants: next });
                            }}
                          />
                        )}
                      </Field>
                    </div>
                  ))}
                </div>
              </fieldset>

              {/*
               * The clinic's own wording for the treatment.
               *
               * The master text is shown beside it as reference, NOT loaded
               * into the box: pre-filling would make a dentist who saves an
               * untouched form adopt Toothlogy's wording as their own, and
               * they would then stop receiving corrections to it (§9).
               */}
              <Field
                label="Your description of this treatment"
                hint="Optional. Leave empty to use Toothlogy's description."
              >
                {(props) => (
                  <textarea
                    {...props}
                    className="tl-input tl-textarea"
                    rows={4}
                    value={editor.customDescription}
                    onChange={(event) =>
                      setEditor({ ...editor, customDescription: event.target.value })
                    }
                    placeholder="Describe this treatment in your own words"
                  />
                )}
              </Field>

              {option.description ? (
                <details className="tl-master-desc">
                  <summary>Toothlogy&rsquo;s description</summary>
                  <p>{option.description}</p>
                  <p className="tl-master-desc__note">
                    Shown to patients when you have not written your own. You cannot edit this
                    text; writing your own replaces it on your profile only.
                  </p>
                </details>
              ) : null}

              <label className="tl-checkbox">
                <input
                  type="checkbox"
                  checked={editor.isPublicVisible}
                  onChange={(event) =>
                    setEditor({ ...editor, isPublicVisible: event.target.checked })
                  }
                />
                <span>Show these prices to patients</span>
              </label>

              <Field label="Note for patients" hint="Optional. Shown beside the price.">
                {(props) => (
                  <Input
                    {...props}
                    value={editor.note}
                    onChange={(event) => setEditor({ ...editor, note: event.target.value })}
                    placeholder="e.g. price depends on the number of canals"
                  />
                )}
              </Field>
            </div>

            <div className="tl-drawer__footer">
              <Button variant="ghost" onClick={() => setEditor(null)}>
                Cancel
              </Button>
              <Button variant="primary" loading={busy} onClick={save}>
                Save prices
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

/**
 * The dentist's own price, which is the most important thing on the row.
 *
 * An unset price says so and offers to fix it, rather than rendering ₹0 or a
 * blank cell (specification §20). ₹0 is a real price — a free consultation —
 * so the two states must not look alike.
 */
function MyPriceCell({
  variant,
  onEdit,
}: {
  readonly variant: VariantView;
  readonly onEdit: () => void;
}) {
  const unset =
    !variant.isCustomQuote &&
    !variant.actualMinor &&
    !variant.discountedMinor &&
    !variant.minMinor &&
    !variant.maxMinor;

  if (unset) {
    return (
      <span className="tl-myprice tl-myprice--unset">
        <span className="tl-myprice__empty">My Price not set</span>
        <Button variant="ghost" size="sm" onClick={onEdit}>
          Add My Price
        </Button>
      </span>
    );
  }

  return (
    <button type="button" className="tl-myprice tl-myprice--button" onClick={onEdit}>
      <PriceCell display={variant.display} />
      <span className="tl-visually-hidden">Edit this price</span>
      <Icon name="arrowRight" className="tl-myprice__pencil" />
    </button>
  );
}

/**
 * Inline price editing.
 *
 * Every state the specification asks for is visible here: editing, saving,
 * validation error and server error. They share one control rather than being
 * three components, because a dentist correcting a rejected value should be
 * typing in the same box that rejected it.
 */
function InlinePriceEditor({
  value,
  state,
  message,
  onChange,
  onCancel,
  onSave,
}: {
  readonly value: string;
  readonly state: 'editing' | 'saving' | 'error';
  readonly message?: string;
  readonly onChange: (value: string) => void;
  readonly onCancel: () => void;
  readonly onSave: () => void;
}) {
  return (
    <span className="tl-inline-price">
      <span className="tl-inline-price__row">
        <input
          className="tl-input tl-inline-price__input"
          inputMode="decimal"
          autoFocus
          aria-label="My Price in rupees"
          aria-invalid={state === 'error' || undefined}
          value={value}
          disabled={state === 'saving'}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={(event) => {
            // Enter saves and Escape abandons, which is what anyone editing a
            // cell in a table expects without being told.
            if (event.key === 'Enter') onSave();
            if (event.key === 'Escape') onCancel();
          }}
        />
        <Button variant="primary" size="sm" loading={state === 'saving'} onClick={onSave}>
          Save
        </Button>
        <Button variant="ghost" size="sm" onClick={onCancel}>
          Cancel
        </Button>
      </span>
      {state === 'error' && message ? (
        <span className="tl-inline-price__error" role="alert">
          {message}
        </span>
      ) : null}
    </span>
  );
}

/** One rendered price, including the struck-through original where there is one. */
function PriceCell({ display }: { readonly display: PriceDisplay }) {
  if (display.kind === 'custom_quote' || display.kind === 'on_request') {
    return <span className="tl-price tl-price--muted">{display.text}</span>;
  }

  return (
    <span className="tl-price">
      {display.kind === 'from' ? <span className="tl-price__prefix">from </span> : null}
      {display.kind === 'up_to' ? <span className="tl-price__prefix">up to </span> : null}
      <strong>{display.primary}</strong>
      {display.rangeEnd ? (
        <>
          <span aria-hidden="true">–</span>
          <span className="tl-visually-hidden">to</span>
          <strong>{display.rangeEnd}</strong>
          {display.openEnded ? '+' : null}
        </>
      ) : null}
      {display.strikethrough ? (
        <s className="tl-price__was">
          <span className="tl-visually-hidden">was </span>
          {display.strikethrough}
        </s>
      ) : null}
      {display.unitLabel ? <span className="tl-price__unit">{display.unitLabel}</span> : null}
    </span>
  );
}

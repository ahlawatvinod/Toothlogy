// @vitest-environment happy-dom

/**
 * TL-TEST-PRICELIST-UI-001 — Price list editor
 *
 * The states a dentist actually lands in: an empty list, a populated one, a
 * filter that matches nothing, and the editor drawer.
 *
 * Queries are role- and text-based rather than by class name, so a test that
 * passes is evidence the interface is reachable, not merely that the markup
 * exists (the same reasoning as tests/design-system/components.test.tsx).
 */

import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { describePrice } from '@/platform/pricing/display';
import {
  PriceListClient,
  type CatalogueOption,
  type PriceRowView,
} from '@/app/(app)/account/price-list/price-list-client';

afterEach(cleanup);

const r = (rupees: number) => BigInt(rupees) * 100n;

const CATALOGUE: CatalogueOption[] = [
  {
    slug: 'crown',
    name: 'Crown',
    shortDescription: 'A cap fitted over a tooth to protect and rebuild it.',
    description:
      'A custom-made cap that covers the whole visible part of a tooth, used where a tooth is heavily filled, cracked or worn.',
    categoryName: 'Crowns & Bridges',
    categorySlug: 'crowns-bridges',
    defaultUnitKey: 'per_crown',
    isCustomQuote: false,
    synonyms: ['cap', 'crown'],
    variants: [
      { slug: 'zirconia', name: 'Zirconia' },
      { slug: 'pfm', name: 'PFM' },
    ],
    suggested: { label: 'Suggested range', value: '₹8,000.00–₹18,000.00' },
  },
  {
    slug: 'root-canal-treatment',
    name: 'Root Canal Treatment',
    shortDescription: 'Treatment of infection inside a tooth so it can be kept.',
    description:
      'The infected nerve tissue inside a tooth is removed, the canals are cleaned and shaped, and the space is sealed.',
    categoryName: 'Root Canal Treatment',
    categorySlug: 'root-canal-treatment',
    defaultUnitKey: 'per_tooth',
    isCustomQuote: false,
    synonyms: ['rct', 'root canal'],
    variants: [{ slug: 'molar', name: 'Molar' }],
    suggested: { label: 'Suggested range', value: '₹3,000.00–₹18,000.00' },
  },
];

const UNITS = [
  { key: 'per_crown', name: 'Per crown', shortLabel: '/crown' },
  { key: 'per_tooth', name: 'Per tooth', shortLabel: '/tooth' },
];

const CLINICS = [
  { id: 'loc_delhi', name: 'Delhi Dental' },
  { id: 'loc_gurgaon', name: 'Gurgaon Dental' },
];

const crownRow: PriceRowView = {
  id: 'dsp_1',
  serviceSlug: 'crown',
  serviceName: 'Crown',
  categoryName: 'Crowns & Bridges',
  locationId: null,
  locationName: null,
  isEnabled: true,
  isPublicVisible: true,
  note: null,
  description: { text: 'A cap fitted over a tooth to protect and rebuild it.', isCustom: false },
  customDescription: null,
  suggested: { label: 'Suggested range', value: '₹8,000.00–₹18,000.00' },
  variants: [
    {
      variantSlug: 'zirconia',
      variantName: 'Zirconia',
      description: { text: 'A crown milled from zirconia.', isCustom: false },
      customDescription: null,
      unitKey: 'per_crown',
      currency: 'INR',
      isCustomQuote: false,
      isEnabled: true,
      minMinor: '',
      maxMinor: '',
      actualMinor: r(12000).toString(),
      discountedMinor: r(10999).toString(),
      display: describePrice({
        actualMinor: r(12000),
        discountedMinor: r(10999),
        currency: 'INR',
        unitLabel: '/crown',
      }),
    },
  ],
};

const hiddenRow: PriceRowView = {
  ...crownRow,
  id: 'dsp_2',
  serviceSlug: 'root-canal-treatment',
  serviceName: 'Root Canal Treatment',
  categoryName: 'Root Canal Treatment',
  isPublicVisible: false,
  locationId: 'loc_delhi',
  locationName: 'Delhi Dental',
  variants: [
    {
      ...crownRow.variants[0]!,
      variantSlug: 'molar',
      variantName: 'Molar',
      display: describePrice({ actualMinor: r(9000), currency: 'INR', unitLabel: '/tooth' }),
    },
  ],
};

function renderList(rows: PriceRowView[]) {
  return render(
    <PriceListClient
      catalogue={CATALOGUE}
      units={UNITS}
      clinics={CLINICS}
      initialRows={rows}
    />,
  );
}

describe('empty state', () => {
  it('explains what to do rather than showing a blank table', () => {
    renderList([]);
    expect(screen.getByText('You have not priced anything yet')).toBeDefined();
    expect(screen.queryByRole('table')).toBeNull();
  });
});

describe('populated list', () => {
  it('renders the treatment, variant and price', () => {
    renderList([crownRow]);
    const table = screen.getByRole('table');
    expect(within(table).getByText('Crown')).toBeDefined();
    expect(within(table).getByText('Zirconia')).toBeDefined();
    expect(within(table).getAllByText('₹10,999.00').length).toBeGreaterThan(0);
  });

  it('shows the discounted price with the original struck through', () => {
    renderList([crownRow]);
    // Both figures present, and the old one carries a "was" for screen readers
    // rather than relying on the strike-through alone.
    expect(screen.getAllByText('₹12,000.00').length).toBeGreaterThan(0);
    expect(screen.getAllByText(/was/).length).toBeGreaterThan(0);
  });

  it('labels the suggested range so it cannot be read as the clinic price', () => {
    renderList([crownRow]);
    expect(screen.getAllByText(/Suggested|₹8,000.00–₹18,000.00/).length).toBeGreaterThan(0);
  });

  it('gives My Price its own column, ahead of the suggested range', () => {
    renderList([crownRow]);
    const headers = screen.getAllByRole('columnheader').map((h) => h.textContent);
    expect(headers).toContain('My Price');
    expect(headers.some((h) => h?.includes('Suggested'))).toBe(true);
  });

  it('shows the resolved description', () => {
    renderList([crownRow]);
    expect(
      screen.getAllByText(/A cap fitted over a tooth/).length,
    ).toBeGreaterThan(0);
  });

  it('distinguishes a published row from a hidden one', () => {
    renderList([crownRow, hiddenRow]);
    expect(screen.getAllByText('Published').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Hidden').length).toBeGreaterThan(0);
  });

  it('renders both a desktop table and mobile cards from the same data', () => {
    // Both are in the DOM and CSS chooses; that is what makes the mobile layout
    // a real layout rather than a squeezed table.
    const { container } = renderList([crownRow]);
    expect(container.querySelector('.tl-pricelist__table')).not.toBeNull();
    expect(container.querySelector('.tl-pricelist__cards')).not.toBeNull();
  });
});

describe('descriptions (§9, §20)', () => {
  it('marks a description the clinic wrote as theirs', () => {
    renderList([
      {
        ...crownRow,
        description: { text: 'We mill our crowns in-house.', isCustom: true },
        customDescription: 'We mill our crowns in-house.',
      },
    ]);
    expect(screen.getAllByText('Your wording').length).toBeGreaterThan(0);
  });

  it('says a description is missing rather than leaving a blank cell', () => {
    renderList([{ ...crownRow, description: { text: null, isCustom: false } }]);
    expect(screen.getAllByText('Description not added').length).toBeGreaterThan(0);
  });

  it('does not pre-fill the editor with Toothlogy’s wording', () => {
    // Pre-filling would make a dentist who saves an untouched form adopt the
    // master text as their own and stop receiving corrections to it.
    renderList([crownRow]);
    fireEvent.click(screen.getAllByRole('button', { name: 'Edit' })[0]!);
    const box = screen.getByLabelText(/Your description of this treatment/) as HTMLTextAreaElement;
    expect(box.value).toBe('');
  });

  it('offers the master description as read-only reference in the editor', () => {
    renderList([crownRow]);
    fireEvent.click(screen.getAllByRole('button', { name: 'Edit' })[0]!);
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getAllByText(/Toothlogy.s description/).length).toBeGreaterThan(0);
    expect(within(dialog).getByText(/cannot edit this text/i)).toBeDefined();
  });

  it('shows the dentist’s own wording in the editor when they wrote some', () => {
    renderList([{ ...crownRow, customDescription: 'Our own words.' }]);
    fireEvent.click(screen.getAllByRole('button', { name: 'Edit' })[0]!);
    const box = screen.getByLabelText(/Your description of this treatment/) as HTMLTextAreaElement;
    expect(box.value).toBe('Our own words.');
  });

  it('marks the suggested price as read only in the editor', () => {
    renderList([crownRow]);
    fireEvent.click(screen.getAllByRole('button', { name: 'Edit' })[0]!);
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText(/read only/i)).toBeDefined();
  });
});

describe('My Price (§4, §8, §20)', () => {
  const unpriced: PriceRowView = {
    ...crownRow,
    variants: [
      {
        ...crownRow.variants[0]!,
        actualMinor: '',
        discountedMinor: '',
        minMinor: '',
        maxMinor: '',
        isCustomQuote: false,
        display: describePrice({ currency: 'INR', unitLabel: '/crown' }),
      },
    ],
  };

  it('says My Price is not set rather than showing ₹0', () => {
    renderList([unpriced]);
    expect(screen.getAllByText('My Price not set').length).toBeGreaterThan(0);
    expect(screen.queryByText('₹0.00')).toBeNull();
  });

  it('offers an Add My Price action on an unpriced row', () => {
    renderList([unpriced]);
    expect(screen.getAllByRole('button', { name: 'Add My Price' }).length).toBeGreaterThan(0);
  });

  it('treats a real zero price as a price, not as unset', () => {
    // A free consultation is a real offer and must not read as "not set".
    renderList([
      {
        ...crownRow,
        variants: [
          {
            ...crownRow.variants[0]!,
            actualMinor: '0',
            discountedMinor: '',
            display: describePrice({ actualMinor: 0n, currency: 'INR', unitLabel: '/crown' }),
          },
        ],
      },
    ]);
    expect(screen.queryByText('My Price not set')).toBeNull();
    expect(screen.getAllByText('₹0.00').length).toBeGreaterThan(0);
  });

  it('opens an inline editor on the price itself', () => {
    renderList([crownRow]);
    fireEvent.click(screen.getAllByRole('button', { name: /Edit this price/ })[0]!);
    expect(screen.getByLabelText('My Price in rupees')).toBeDefined();
  });

  it('pre-fills the inline editor with the current price in rupees', () => {
    renderList([crownRow]);
    fireEvent.click(screen.getAllByRole('button', { name: /Edit this price/ })[0]!);
    expect((screen.getByLabelText('My Price in rupees') as HTMLInputElement).value).toBe('12000');
  });

  it('rejects a non-numeric inline price without calling the server', () => {
    renderList([crownRow]);
    fireEvent.click(screen.getAllByRole('button', { name: /Edit this price/ })[0]!);
    fireEvent.change(screen.getByLabelText('My Price in rupees'), {
      target: { value: 'twelve thousand' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    const alert = screen.getByRole('alert');
    expect(alert.textContent).toMatch(/Enter an amount/);
    expect(screen.getByLabelText('My Price in rupees')).toBeDefined();
  });

  it('cancels inline editing with Escape', () => {
    renderList([crownRow]);
    fireEvent.click(screen.getAllByRole('button', { name: /Edit this price/ })[0]!);
    fireEvent.keyDown(screen.getByLabelText('My Price in rupees'), { key: 'Escape' });
    expect(screen.queryByLabelText('My Price in rupees')).toBeNull();
  });

  it('cancels inline editing with the Cancel button', () => {
    renderList([crownRow]);
    fireEvent.click(screen.getAllByRole('button', { name: /Edit this price/ })[0]!);
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByLabelText('My Price in rupees')).toBeNull();
  });

  it('only puts the edited cell into edit mode', () => {
    renderList([crownRow, hiddenRow]);
    fireEvent.click(screen.getAllByRole('button', { name: /Edit this price/ })[0]!);
    expect(screen.getAllByLabelText('My Price in rupees')).toHaveLength(1);
  });
});

describe('search and filters', () => {
  it('finds a treatment by the term a patient would type', () => {
    renderList([crownRow, hiddenRow]);
    fireEvent.change(screen.getByLabelText(/Search treatments/), { target: { value: 'RCT' } });

    const table = screen.getByRole('table');
    expect(within(table).getAllByText('Root Canal Treatment').length).toBeGreaterThan(0);
    expect(within(table).queryByText('Crown')).toBeNull();
  });

  it('filters to one clinic', () => {
    renderList([crownRow, hiddenRow]);
    fireEvent.change(screen.getByLabelText('Clinic'), { target: { value: 'loc_delhi' } });

    // The service and its category are both called "Root Canal Treatment" in
    // the real catalogue, so this legitimately matches twice.
    const table = screen.getByRole('table');
    expect(within(table).getAllByText('Root Canal Treatment').length).toBeGreaterThan(0);
    expect(within(table).queryByText('Crown')).toBeNull();
  });

  it('filters to hidden rows', () => {
    renderList([crownRow, hiddenRow]);
    fireEvent.change(screen.getByLabelText('Status'), { target: { value: 'hidden' } });
    expect(screen.getByRole('table')).toBeDefined();
    expect(within(screen.getByRole('table')).queryByText('Crown')).toBeNull();
  });

  it('says so when a filter matches nothing, rather than showing an empty table', () => {
    renderList([crownRow]);
    fireEvent.change(screen.getByLabelText(/Search treatments/), {
      target: { value: 'orthognathic' },
    });
    expect(screen.getByText('Nothing matches those filters')).toBeDefined();
  });

  it('offers unpriced catalogue treatments matching the search', () => {
    renderList([crownRow]);
    fireEvent.change(screen.getByLabelText(/Search treatments/), { target: { value: 'root canal' } });
    expect(screen.getByText('Not on your list yet')).toBeDefined();
  });
});

describe('editor', () => {
  it('opens as a labelled modal dialog', () => {
    renderList([crownRow]);
    fireEvent.click(screen.getAllByRole('button', { name: 'Edit' })[0]!);

    const dialog = screen.getByRole('dialog');
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(within(dialog).getByText('Crown')).toBeDefined();
  });

  it('shows the suggested price as a labelled reference inside the editor', () => {
    renderList([crownRow]);
    fireEvent.click(screen.getAllByRole('button', { name: 'Edit' })[0]!);
    const dialog = screen.getByRole('dialog');
    // Labelled "Suggested India price", never presented as the dentist's own.
    expect(within(dialog).getByText(/Suggested India price/)).toBeDefined();
  });

  it('offers a field for every variant of the treatment', () => {
    renderList([crownRow]);
    fireEvent.click(screen.getAllByRole('button', { name: 'Edit' })[0]!);
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('Zirconia')).toBeDefined();
    expect(within(dialog).getByText('PFM')).toBeDefined();
  });

  it('hides the price fields when a variant is marked custom quote', () => {
    renderList([crownRow]);
    fireEvent.click(screen.getAllByRole('button', { name: 'Edit' })[0]!);
    const dialog = screen.getByRole('dialog');

    const before = within(dialog).getAllByLabelText(/Your price/).length;
    fireEvent.click(within(dialog).getAllByLabelText('Quote on examination')[0]!);
    expect(within(dialog).getAllByLabelText(/Your price/).length).toBe(before - 1);
  });

  it('closes without saving', () => {
    renderList([crownRow]);
    fireEvent.click(screen.getAllByRole('button', { name: 'Edit' })[0]!);
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('refuses to save with no price entered at all', () => {
    renderList([]);
    fireEvent.change(screen.getByLabelText(/Search treatments/), { target: { value: 'crown' } });
    fireEvent.click(screen.getByRole('button', { name: /Crown/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Save prices' }));

    expect(screen.getByText(/Enter at least one price/)).toBeDefined();
  });
});

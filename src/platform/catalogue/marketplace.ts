/**
 * Marketplace reference data: the business types that sell on Toothlogy and
 * the categories their products and services are listed under. A closed
 * list, so a buyer filtering by "Implants" finds every implant listing and
 * not a dozen spellings of it.
 */

export const BUSINESS_TYPES = ['SUPPLIER', 'MANUFACTURER', 'DISTRIBUTOR', 'WHOLESALER', 'RETAILER', 'LABORATORY'] as const;
export type BusinessType = (typeof BUSINESS_TYPES)[number];

export const BUSINESS_TYPE_LABEL: Record<BusinessType, string> = {
  SUPPLIER: 'Supplier',
  MANUFACTURER: 'Manufacturer',
  DISTRIBUTOR: 'Distributor',
  WHOLESALER: 'Wholesaler',
  RETAILER: 'Retailer',
  LABORATORY: 'Dental laboratory',
};

export const isBusinessType = (type: string): type is BusinessType => (BUSINESS_TYPES as readonly string[]).includes(type);

export interface MarketplaceCategory {
  readonly key: string;
  readonly label: string;
  /** What is usually listed under it: goods, or a service such as lab work. */
  readonly kind: 'GOOD' | 'SERVICE';
}

export const MARKETPLACE_CATEGORIES: readonly MarketplaceCategory[] = [
  { key: 'consumables', label: 'Consumables', kind: 'GOOD' },
  { key: 'restoratives', label: 'Restorative materials', kind: 'GOOD' },
  { key: 'endodontics', label: 'Endodontics', kind: 'GOOD' },
  { key: 'orthodontics', label: 'Orthodontics', kind: 'GOOD' },
  { key: 'implants', label: 'Implants and surgical', kind: 'GOOD' },
  { key: 'prosthodontics', label: 'Impression and prosthetic materials', kind: 'GOOD' },
  { key: 'instruments', label: 'Hand instruments', kind: 'GOOD' },
  { key: 'handpieces', label: 'Handpieces and motors', kind: 'GOOD' },
  { key: 'equipment', label: 'Chairs and equipment', kind: 'GOOD' },
  { key: 'imaging', label: 'Imaging and X-ray', kind: 'GOOD' },
  { key: 'sterilization', label: 'Sterilization and infection control', kind: 'GOOD' },
  { key: 'furniture', label: 'Clinic furniture', kind: 'GOOD' },
  { key: 'software', label: 'Practice software', kind: 'SERVICE' },
  { key: 'lab_crowns_bridges', label: 'Lab: crowns and bridges', kind: 'SERVICE' },
  { key: 'lab_dentures', label: 'Lab: dentures', kind: 'SERVICE' },
  { key: 'lab_aligners', label: 'Lab: aligners and appliances', kind: 'SERVICE' },
  { key: 'lab_implant_restorations', label: 'Lab: implant restorations', kind: 'SERVICE' },
  { key: 'maintenance', label: 'Equipment service and repair', kind: 'SERVICE' },
];

export const CATEGORY_BY_KEY: ReadonlyMap<string, MarketplaceCategory> = new Map(MARKETPLACE_CATEGORIES.map((c) => [c.key, c]));

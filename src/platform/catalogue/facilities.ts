/**
 * TOOTHLOGY CLINIC FACILITY VOCABULARY — reference data
 *
 * A controlled list, so "digital X-ray" is one filterable fact rather than
 * forty spellings of it across clinic profiles. A clinic claims facilities
 * from this list; free text is not accepted. Claims are the clinic's own
 * statement until verification checks them, and the public profile says so.
 */

export interface FacilityDefinition {
  readonly key: string;
  readonly label: string;
  readonly group: 'imaging' | 'hygiene' | 'comfort' | 'access' | 'technology';
}

export const FACILITIES: readonly FacilityDefinition[] = [
  { key: 'digital_xray', label: 'Digital X-ray (IOPA)', group: 'imaging' },
  { key: 'opg', label: 'Panoramic X-ray (OPG)', group: 'imaging' },
  { key: 'cbct', label: '3D scan (CBCT)', group: 'imaging' },
  { key: 'intraoral_scanner', label: 'Intraoral scanner', group: 'technology' },
  { key: 'cad_cam', label: 'Same-day crowns (CAD/CAM)', group: 'technology' },
  { key: 'dental_laser', label: 'Dental laser', group: 'technology' },
  { key: 'dental_microscope', label: 'Dental microscope', group: 'technology' },
  { key: 'sterilization_class_b', label: 'Class B autoclave sterilisation', group: 'hygiene' },
  { key: 'single_use_instruments', label: 'Single-use instruments where applicable', group: 'hygiene' },
  { key: 'conscious_sedation', label: 'Conscious sedation', group: 'comfort' },
  { key: 'kids_friendly', label: 'Child-friendly treatment area', group: 'comfort' },
  { key: 'wifi', label: 'Wi-Fi', group: 'comfort' },
  { key: 'wheelchair_access', label: 'Wheelchair access', group: 'access' },
  { key: 'lift', label: 'Lift', group: 'access' },
  { key: 'parking', label: 'Parking', group: 'access' },
  { key: 'card_payments', label: 'Card payments', group: 'access' },
  { key: 'upi_payments', label: 'UPI payments', group: 'access' },
  { key: 'insurance_cashless', label: 'Cashless insurance', group: 'access' },
];

export const FACILITY_BY_KEY: ReadonlyMap<string, FacilityDefinition> = new Map(FACILITIES.map((f) => [f.key, f]));

export const APPOINTMENT_TYPES = ['CLINIC', 'VIDEO', 'HOME_VISIT'] as const;
export type AppointmentType = (typeof APPOINTMENT_TYPES)[number];

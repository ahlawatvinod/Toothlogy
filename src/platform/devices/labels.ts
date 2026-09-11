/**
 * Labels for connected equipment, shared by the service and the browser forms
 * (no server imports, so client components may use it).
 */

export const DEVICE_KINDS = [
  ['AUTOCLAVE', 'Autoclave'],
  ['DENTAL_CHAIR', 'Dental chair'],
  ['COMPRESSOR', 'Compressor'],
  ['SUCTION', 'Suction unit'],
  ['XRAY_UNIT', 'X-ray unit'],
  ['WATERLINE', 'Waterline'],
  ['REFRIGERATOR', 'Medicine refrigerator'],
  ['OTHER', 'Other'],
] as const;

export const DEVICE_KIND_LABEL: Readonly<Record<string, string>> = Object.fromEntries(DEVICE_KINDS);

/** Metric names a device sends: lower-case words joined by underscores, unit last ("temperature_c"). */
export const METRIC_PATTERN = /^[a-z][a-z0-9_]{1,39}$/;

/** A metric every device may send: any value above 0 is a fault code, and opens an alert. */
export const FAULT_METRIC = 'fault';

/** What devices of each kind commonly report — a hint for setting limits, not a rule. */
export const SUGGESTED_METRICS: Readonly<Record<string, readonly string[]>> = {
  AUTOCLAVE: ['temperature_c', 'pressure_bar', 'fault'],
  DENTAL_CHAIR: ['running_hours', 'fault'],
  COMPRESSOR: ['pressure_bar', 'running_hours', 'fault'],
  SUCTION: ['vacuum_kpa', 'fault'],
  XRAY_UNIT: ['exposures', 'fault'],
  WATERLINE: ['chlorine_ppm', 'fault'],
  REFRIGERATOR: ['temperature_c', 'fault'],
  OTHER: ['fault'],
};

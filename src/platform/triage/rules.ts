/**
 * TOOTHLOGY CONCERN ROUTING — "which kind of dentist should I see?"
 *
 * Fixed, reviewable rules. Not AI, and not a diagnosis (Constitution §5):
 * a person picks what is bothering them from a closed list and answers a few
 * safety questions. The answer is only where to go — emergency care now, a
 * dentist within the hour, soon, or at a routine visit — and which kind of
 * dentist and which treatment pages to look at.
 *
 * Pure functions over data: they run in the browser, so the answers never
 * leave the device and nothing is stored.
 *
 * Every specialty and treatment key here must exist in the catalogues; a unit
 * test holds that, so a renamed key cannot silently send people nowhere.
 */

export type Urgency = 'EMERGENCY_NOW' | 'WITHIN_THE_HOUR' | 'SOON' | 'ROUTINE';

export interface RedFlag {
  readonly key: string;
  readonly label: string;
}

/** Any of these means emergency care now, whatever else is chosen. */
export const RED_FLAGS: readonly RedFlag[] = [
  { key: 'breathing', label: 'Trouble breathing or swallowing' },
  { key: 'spreading_swelling', label: 'Swelling spreading to the eye, the neck or under the tongue' },
  { key: 'bleeding', label: 'Bleeding that does not stop after 15 minutes of firm pressure' },
  { key: 'head_injury', label: 'A blow to the face or head with fainting, confusion, or a jaw that may be broken' },
  { key: 'fever_swelling', label: 'A high fever with a swollen face' },
];

export interface Concern {
  readonly key: string;
  readonly label: string;
  readonly urgency: Exclude<Urgency, 'EMERGENCY_NOW'>;
  /** Specialty keys (the list /find filters on), most relevant first. */
  readonly specialties: readonly string[];
  /** Treatment keys whose pages explain what may be offered. */
  readonly treatments: readonly string[];
  /** Safety or practical advice that holds whatever the cause. Never a diagnosis. */
  readonly note?: string;
}

export const CONCERNS: readonly Concern[] = [
  { key: 'knocked_out', label: 'An adult tooth knocked out', urgency: 'WITHIN_THE_HOUR', specialties: ['general_dentistry'], treatments: ['emergency_visit'], note: 'Pick the tooth up by the crown, not the root. Keep it in milk or inside your cheek, and see a dentist within the hour.' },
  { key: 'toothache', label: 'Toothache', urgency: 'SOON', specialties: ['general_dentistry', 'endodontics'], treatments: ['dental_consultation', 'root_canal_treatment'], note: 'Pain that wakes you at night, or lasts more than a day or two, should be seen soon.' },
  { key: 'swelling', label: 'Swelling of the gum or face', urgency: 'SOON', specialties: ['general_dentistry', 'oral_surgery'], treatments: ['emergency_visit'], note: 'Swelling can mean infection. Try to be seen the same day.' },
  { key: 'broken_tooth', label: 'A chipped or broken tooth', urgency: 'SOON', specialties: ['general_dentistry', 'prosthodontics'], treatments: ['composite_filling', 'crown_zirconia'] },
  { key: 'wisdom_tooth', label: 'Pain at the back of the jaw (wisdom tooth)', urgency: 'SOON', specialties: ['oral_surgery'], treatments: ['opg_xray', 'surgical_extraction'] },
  { key: 'loose_tooth', label: 'A loose adult tooth', urgency: 'SOON', specialties: ['periodontics'], treatments: ['deep_cleaning'] },
  { key: 'mouth_sore', label: 'A sore, patch or lump in the mouth that has not healed in two weeks', urgency: 'SOON', specialties: ['oral_pathology', 'oral_surgery'], treatments: ['oral_lesion_evaluation'], note: 'Most are harmless, but one that has not healed in two weeks should be examined.' },
  { key: 'bleeding_gums', label: 'Bleeding or swollen gums', urgency: 'ROUTINE', specialties: ['periodontics'], treatments: ['scaling_polishing', 'deep_cleaning'] },
  { key: 'sensitivity', label: 'Sensitive teeth', urgency: 'ROUTINE', specialties: ['general_dentistry'], treatments: ['dental_consultation', 'composite_filling'] },
  { key: 'missing_teeth', label: 'Missing teeth', urgency: 'ROUTINE', specialties: ['prosthodontics', 'implantology'], treatments: ['dental_implant', 'dental_bridge', 'partial_denture'] },
  { key: 'crooked_teeth', label: 'Crooked teeth, or a bite that does not meet', urgency: 'ROUTINE', specialties: ['orthodontics'], treatments: ['metal_braces', 'clear_aligners'] },
  { key: 'jaw_pain', label: 'Jaw pain or clicking', urgency: 'ROUTINE', specialties: ['oral_surgery', 'prosthodontics'], treatments: ['dental_consultation'] },
  { key: 'bad_breath', label: 'Bad breath', urgency: 'ROUTINE', specialties: ['periodontics', 'general_dentistry'], treatments: ['scaling_polishing'] },
  { key: 'appearance', label: 'The colour or shape of my teeth', urgency: 'ROUTINE', specialties: ['cosmetic_dentistry', 'prosthodontics'], treatments: ['teeth_whitening', 'veneers'] },
  { key: 'checkup', label: 'A check-up or a cleaning', urgency: 'ROUTINE', specialties: ['general_dentistry'], treatments: ['dental_consultation', 'scaling_polishing'] },
];

/**
 * Emergency numbers are per-country reference data, not logic. A market is
 * added here when it opens; with none known, the answer says "your local
 * emergency number".
 */
export const EMERGENCY_NUMBERS: Readonly<Record<string, string>> = { IN: '112' };

const RANK: Record<Urgency, number> = { EMERGENCY_NOW: 3, WITHIN_THE_HOUR: 2, SOON: 1, ROUTINE: 0 };
const BY_KEY = new Map(CONCERNS.map((c) => [c.key, c]));
const FLAG_KEYS = new Set(RED_FLAGS.map((f) => f.key));

export interface RouteInput {
  readonly concerns: readonly string[];
  readonly redFlags: readonly string[];
  /** The person is asking about a child: a children's dentist comes first. */
  readonly forChild?: boolean;
}

export interface Route {
  readonly urgency: Urgency;
  readonly specialties: readonly string[];
  readonly treatments: readonly string[];
  readonly notes: readonly string[];
  /** Where to search: specialty (and emergency when it cannot wait). Null when emergency care comes first. */
  readonly findQuery: string | null;
}

/** Where to go for these concerns. Throws on keys outside the closed lists. */
export function routeConcerns(input: RouteInput): Route {
  for (const flag of input.redFlags) if (!FLAG_KEYS.has(flag)) throw new RangeError(`Unknown safety question: ${flag}`);
  const concerns = input.concerns.map((key) => {
    const concern = BY_KEY.get(key);
    if (!concern) throw new RangeError(`Unknown concern: ${key}`);
    return concern;
  });
  if (concerns.length === 0 && input.redFlags.length === 0) throw new RangeError('Choose at least one concern.');

  const unique = <T,>(items: readonly T[]) => [...new Set(items)];
  const specialties = unique([...(input.forChild ? ['pedodontics'] : []), ...concerns.flatMap((c) => c.specialties)]);
  const treatments = unique(concerns.flatMap((c) => c.treatments));
  const notes = unique(concerns.flatMap((c) => (c.note ? [c.note] : [])));

  if (input.redFlags.length > 0) {
    return { urgency: 'EMERGENCY_NOW', specialties, treatments, notes, findQuery: null };
  }
  const urgency = concerns.reduce<Urgency>((worst, c) => (RANK[c.urgency] > RANK[worst] ? c.urgency : worst), 'ROUTINE');
  const params = new URLSearchParams();
  if (specialties[0]) params.set('specialty', specialties[0]);
  if (urgency === 'WITHIN_THE_HOUR') params.set('emergency', '1');
  return { urgency, specialties, treatments, notes, findQuery: params.toString() };
}

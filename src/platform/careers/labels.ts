/**
 * Labels for careers, shared by the service and the browser forms (no server
 * imports, so client components may use it).
 */

export const JOB_KINDS = [
  ['JOB', 'Job'],
  ['INTERNSHIP', 'Internship'],
] as const;

export const JOB_ROLES = [
  ['DENTIST', 'Dentist'],
  ['SPECIALIST', 'Specialist'],
  ['INTERN', 'Intern'],
  ['ASSISTANT', 'Dental assistant'],
  ['HYGIENIST', 'Dental hygienist'],
  ['TECHNICIAN', 'Dental technician'],
  ['RECEPTIONIST', 'Front desk'],
  ['FACULTY', 'Faculty'],
  ['MANAGER', 'Practice manager'],
  ['OTHER', 'Other'],
] as const;

export const EMPLOYMENT_TYPES = [
  ['FULL_TIME', 'Full-time'],
  ['PART_TIME', 'Part-time'],
  ['VISITING', 'Visiting'],
  ['LOCUM', 'Locum'],
  ['INTERNSHIP', 'Internship'],
] as const;

export const JOB_KIND_LABEL: Readonly<Record<string, string>> = Object.fromEntries(JOB_KINDS);
export const JOB_ROLE_LABEL: Readonly<Record<string, string>> = Object.fromEntries(JOB_ROLES);
export const EMPLOYMENT_TYPE_LABEL: Readonly<Record<string, string>> = Object.fromEntries(EMPLOYMENT_TYPES);

export const POSTING_STATUS_LABEL: Readonly<Record<string, string>> = { DRAFT: 'Draft', OPEN: 'Open', CLOSED: 'Closed', FILLED: 'Filled' };

export const APPLICATION_STATUS_LABEL: Readonly<Record<string, string>> = {
  SUBMITTED: 'Received',
  SHORTLISTED: 'Shortlisted',
  INTERVIEW: 'Interview',
  OFFERED: 'Offer made',
  HIRED: 'Hired',
  REJECTED: 'Not taken forward',
  WITHDRAWN: 'Withdrawn',
};

/** What an employer may do next, by the application's status. */
export const NEXT_ACTIONS: Readonly<Record<string, ReadonlyArray<readonly [string, string]>>> = {
  SUBMITTED: [['SHORTLIST', 'Shortlist'], ['INTERVIEW', 'Invite to interview'], ['REJECT', 'Not taking forward']],
  SHORTLISTED: [['INTERVIEW', 'Invite to interview'], ['OFFER', 'Make an offer'], ['REJECT', 'Not taking forward']],
  INTERVIEW: [['INTERVIEW', 'Change the interview'], ['OFFER', 'Make an offer'], ['REJECT', 'Not taking forward']],
  OFFERED: [['HIRE', 'Mark hired'], ['REJECT', 'Not taking forward']],
};

/** "₹40,000–₹60,000 a month" from whole rupees; null when not stated. */
export function payText(minMinor: number | null, maxMinor: number | null, kind: string): string | null {
  const rupees = (minor: number) => `₹${new Intl.NumberFormat('en-IN').format(Math.round(minor / 100))}`;
  const label = kind === 'INTERNSHIP' ? 'Stipend ' : '';
  if (minMinor != null && maxMinor != null && minMinor !== maxMinor) return `${label}${rupees(minMinor)}–${rupees(maxMinor)} a month`;
  if (minMinor != null) return `${label}${maxMinor == null ? 'from ' : ''}${rupees(minMinor)} a month`;
  if (maxMinor != null) return `${label}up to ${rupees(maxMinor)} a month`;
  return null;
}

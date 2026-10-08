import type { ProfessionalTitle } from '../types';

export const PROFESSIONAL_TITLES: readonly ProfessionalTitle[] = ['Dr.', 'Dra.'];

export const DEFAULT_PROFESSIONAL_TITLE: ProfessionalTitle = 'Dr.';

/**
 * Coerces any stored or submitted value into a valid professional title.
 * A missing or unknown value (e.g. a database without the column yet) reads as "Dr.".
 */
export function normalizeProfessionalTitle(value: unknown): ProfessionalTitle {
  return PROFESSIONAL_TITLES.includes(value as ProfessionalTitle)
    ? (value as ProfessionalTitle)
    : DEFAULT_PROFESSIONAL_TITLE;
}

// A title someone typed into the name itself: "Dr.", "Dra.", "Dr/a", "Dr", "Dra"
// followed by whitespace. Requiring the separator keeps names like "Drago" intact.
const LEADING_TITLE = /^(?:dr\/a|dra|dr)\.?\s+/i;

/**
 * "Dra." + "Lucía Fernández" -> "Dra. Lucía Fernández". A missing or unknown
 * title reads as "Dr."; a title already typed into the name is replaced, so it
 * never renders as "Dr. Dra. ...". Returns '' when there is no name.
 */
export function formatDoctorName(title: unknown, fullName: string | null | undefined): string {
  const name = String(fullName ?? '').trim().replace(LEADING_TITLE, '').trim();
  if (!name || /^(?:dr\/a|dra|dr)\.?$/i.test(name)) return '';
  return `${normalizeProfessionalTitle(title)} ${name.replace(/\s+/g, ' ')}`;
}

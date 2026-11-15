// Local copy of src/utils/doctorName.ts (edge functions cannot import from src):
// a missing/unknown title reads as "Dr."; a title typed into the name is dropped.
const LEADING_TITLE = /^(?:dr\/a|dra|dr)\.?\s+/i

export function formatDoctorName(title: unknown, fullName: string | null | undefined): string {
  const name = String(fullName ?? '').trim().replace(LEADING_TITLE, '').trim()
  if (!name || /^(?:dr\/a|dra|dr)\.?$/i.test(name)) return ''
  const safeTitle = title === 'Dra.' ? 'Dra.' : 'Dr.'
  return `${safeTitle} ${name.replace(/\s+/g, ' ')}`
}

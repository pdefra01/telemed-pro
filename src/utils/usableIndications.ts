// Mirrors the server rule in server/whatsapp.js (extractUsableIndications):
// blank notes and notes starting with the legacy "Recetado para:" prefix are
// never sent, so the client must not fire a send for them.
const LEGACY_NOTES_PREFIX = 'Recetado para:';

export function hasUsableIndications(text: string): boolean {
  const trimmed = text.trim();
  return trimmed !== '' && !trimmed.startsWith(LEGACY_NOTES_PREFIX);
}

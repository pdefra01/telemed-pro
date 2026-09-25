export const MAX_EXTERNAL_URL_LENGTH = 2000;

/** Returns a Spanish error message, or null when the link is a valid https URL. */
export function validateExternalPrescriptionUrl(value: string): string | null {
  const url = value.trim();
  if (!url) return 'Ingresá el link de descarga de la receta de obra social';
  if (url.length > MAX_EXTERNAL_URL_LENGTH) return 'El link es demasiado largo';
  try {
    if (new URL(url).protocol === 'https:' && !/\s/.test(url)) return null;
  } catch {
    // falls through to the generic message
  }
  return 'El link debe ser una dirección válida que empiece con https://';
}

/** True only for a stored link that is safe to render as an anchor href. */
export function isSafeExternalPrescriptionUrl(value?: string): boolean {
  return !!value && !/\s/.test(value) && validateExternalPrescriptionUrl(value) === null;
}

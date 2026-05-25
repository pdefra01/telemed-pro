/**
 * Genera un UUID versión 4 de forma segura y compatible con todos los navegadores,
 * incluso en contextos no seguros (HTTP) donde window.crypto.randomUUID no está disponible.
 */
export function generateUUID(): string {
  if (
    typeof window !== 'undefined' &&
    window.crypto &&
    typeof window.crypto.randomUUID === 'function'
  ) {
    return window.crypto.randomUUID();
  }

  // Fallback compatible con RFC4122 versión 4 para contextos HTTP
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

// WhatsApp delivery helpers (sdd: odd/whatsapp-prescription-delivery, T1).
//
// Messages are sent from the company's phone through a self-hosted WAHA
// gateway linked to that phone as a device. Nothing here ever touches the
// doctor's own number.

const AR_NATIONAL_LENGTH = 10; // area code + subscriber number, no trunk 0 / mobile 15

/**
 * Reduces an Argentine national number (already stripped of the country code,
 * the trunk "0" and the mobile "9") to exactly 10 digits, removing the legacy
 * "15" mobile prefix that follows the area code. Returns null if unusable.
 */
function toArgentineNational(digits) {
  let national = digits.replace(/^0/, '');
  if (national.length === AR_NATIONAL_LENGTH) return national;
  if (national.length === AR_NATIONAL_LENGTH + 2) {
    // area code is 2, 3 or 4 digits; the "15" sits right after it.
    for (const areaLength of [2, 3, 4]) {
      if (national.slice(areaLength, areaLength + 2) === '15') {
        return national.slice(0, areaLength) + national.slice(areaLength + 2);
      }
    }
  }
  return null;
}

/**
 * Normalizes a phone number to the digits WhatsApp expects. Argentine mobiles
 * become `549` + area + number. A `+`-prefixed foreign number is kept as-is.
 * Returns null when the input cannot be trusted as a phone number.
 */
export function normalizeArgentinePhone(raw) {
  if (raw === null || raw === undefined) return null;
  const text = String(raw).trim();
  let digits = text.replace(/\D/g, '');
  if (!digits) return null;

  const hasPlus = text.startsWith('+');
  if (digits.startsWith('00')) digits = digits.slice(2);

  if (digits.startsWith('54')) {
    let rest = digits.slice(2).replace(/^0/, '');
    if (rest.length === AR_NATIONAL_LENGTH + 1 && rest.startsWith('9')) rest = rest.slice(1);
    const national = toArgentineNational(rest);
    return national ? `549${national}` : null;
  }

  if (hasPlus) {
    return digits.length >= 8 && digits.length <= 15 ? digits : null;
  }

  const national = toArgentineNational(digits);
  return national ? `549${national}` : null;
}

/**
 * Generic, link-free message that accompanies the prescription PDF. The PDF is
 * attached, so the text carries no URL, and it never includes phone numbers.
 */
export function buildPrescriptionMessage({ patientName, doctorName } = {}) {
  const greeting = patientName ? `Hola ${patientName},` : 'Hola,';
  const doctor = doctorName ? `el Dr. ${doctorName}` : 'tu médico';
  return (
    `${greeting} te enviamos la receta electrónica de tu consulta con ${doctor}.\n\n` +
    'La encontrás adjunta en este mensaje. Si tenés alguna consulta, respondé por la plataforma.'
  );
}

/**
 * Minimal WAHA client. `fetchFn` is injectable so the module is unit-testable
 * without a network.
 */
export function createWahaClient({ baseUrl, apiKey, session = 'default', fetchFn = fetch }) {
  const root = String(baseUrl).replace(/\/+$/, '');
  const headers = { 'Content-Type': 'application/json', 'X-Api-Key': apiKey };

  async function sendFile({ phone, bytes, filename, caption, mimetype = 'application/pdf' }) {
    const response = await fetchFn(`${root}/api/sendFile`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        session,
        chatId: `${phone}@c.us`,
        caption,
        file: { mimetype, filename, data: Buffer.from(bytes).toString('base64') },
      }),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw new Error(`WAHA ${response.status}: ${detail}`);
    }
    return response.json();
  }

  async function isSessionReady() {
    try {
      const response = await fetchFn(`${root}/api/sessions/${session}`, { headers });
      if (!response.ok) return false;
      const body = await response.json();
      return body?.status === 'WORKING';
    } catch {
      return false;
    }
  }

  return { sendFile, isSessionReady };
}

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

// Minimum gap between two successful sends of the same prescription. Protects
// the company number from accidental double-clicks (unofficial channel: bursts
// of identical messages are the fastest way to get flagged).
const RESEND_GUARD_MS = 60_000;

/**
 * Sends a prescription PDF to its patient from the company's WhatsApp number.
 *
 * Only the doctor who issued the prescription may trigger it. Every outcome
 * (sent or failed) is written to `prescription_deliveries` so the doctor can
 * see failures and retry. Returns `{ status, body }` for the HTTP layer.
 */
export async function sendPrescriptionViaWhatsApp(
  { supabaseAdmin, waha, fetchFn = fetch, now = () => new Date() },
  { prescriptionId, requesterId }
) {
  const { data: prescription } = await supabaseAdmin
    .from('prescriptions')
    .select('id, doctor_id, patient_id, doctor_name, pdf_url')
    .eq('id', prescriptionId)
    .maybeSingle();

  if (!prescription) return { status: 404, body: { error: 'prescription_not_found' } };
  if (prescription.doctor_id !== requesterId) return { status: 403, body: { error: 'forbidden' } };
  if (!prescription.pdf_url) return { status: 422, body: { error: 'no_pdf' } };

  const record = async (status, error = null) => {
    const { error: insertError } = await supabaseAdmin.from('prescription_deliveries').insert({
      prescription_id: prescription.id,
      channel: 'whatsapp',
      status,
      error,
      requested_by: requesterId,
    });
    if (insertError) console.error('[whatsapp] could not log delivery:', insertError.message);
  };
  const fail = async (httpStatus, reason) => {
    await record('failed', reason.slice(0, 500));
    return { status: httpStatus, body: { status: 'failed', reason } };
  };

  const { data: lastSent } = await supabaseAdmin
    .from('prescription_deliveries')
    .select('created_at')
    .eq('prescription_id', prescription.id)
    .eq('status', 'sent')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (lastSent && now() - new Date(lastSent.created_at) < RESEND_GUARD_MS) {
    return { status: 409, body: { status: 'already_sent' } };
  }

  const { data: patient } = await supabaseAdmin
    .from('profiles')
    .select('full_name, phone')
    .eq('id', prescription.patient_id)
    .maybeSingle();

  const phone = normalizeArgentinePhone(patient?.phone);
  if (!phone) return fail(422, 'invalid_phone');

  if (!(await waha.isSessionReady())) return fail(503, 'session_not_ready');

  let bytes;
  try {
    const response = await fetchFn(prescription.pdf_url);
    if (!response.ok) throw new Error(`status ${response.status}`);
    bytes = new Uint8Array(await response.arrayBuffer());
  } catch {
    return fail(502, 'pdf_unavailable');
  }

  try {
    await waha.sendFile({
      phone,
      bytes,
      filename: `receta-${String(prescription.id).slice(0, 8)}.pdf`,
      caption: buildPrescriptionMessage({
        patientName: patient?.full_name,
        doctorName: prescription.doctor_name,
      }),
    });
  } catch (err) {
    return fail(502, `send_failed: ${err?.message || err}`);
  }

  await record('sent');
  return { status: 200, body: { status: 'sent' } };
}

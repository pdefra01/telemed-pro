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

  async function sendText({ phone, text }) {
    const response = await fetchFn(`${root}/api/sendText`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ session, chatId: `${phone}@c.us`, text }),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw new Error(`WAHA ${response.status}: ${detail}`);
    }
    return response.json();
  }

  return { sendFile, sendText, isSessionReady };
}

// Minimum gap between two successful sends of the same prescription. Protects
// the company number from accidental double-clicks (unofficial channel: bursts
// of identical messages are the fastest way to get flagged).
const RESEND_GUARD_MS = 60_000;

const PRESCRIPTIONS_PDFS_BUCKET = 'prescriptions_pdfs';
const SIGNED_URL_TTL_SECONDS = 60 * 60 * 48; // 48h

/**
 * Extracts the storage object path from a legacy Supabase public-bucket URL,
 * e.g. `.../storage/v1/object/public/prescriptions_pdfs/<path>` -> `<path>`.
 * Returns `null` when the URL doesn't contain that bucket's public-URL
 * prefix (missing/foreign URL, or already-private link).
 */
export function extractStoragePathFromPublicUrl(publicUrl, bucket) {
  if (!publicUrl) return null;
  const marker = `/object/public/${bucket}/`;
  const idx = String(publicUrl).indexOf(marker);
  if (idx === -1) return null;
  // Drop a trailing query string or fragment: a bare storage path must not
  // carry either, or createSignedUrl fails with a confusing "object not
  // found" instead of a clear parse failure.
  const path = publicUrl.slice(idx + marker.length).split(/[?#]/)[0];
  return path || null;
}

// Prescriptions issued before indications became a first-class field stored an
// autogenerated "Recetado para: <diagnosis>" in `notes`; that is not something
// the doctor wrote for the patient, so it must never be resent.
const LEGACY_NOTES_PREFIX = 'Recetado para:';

// Prefix of the error logged when the PDF went out but a later message failed.
const PARTIAL_PDF_SENT_MARKER = 'partial:pdf_sent';

function extractUsableIndications(notes) {
  const text = typeof notes === 'string' ? notes.trim() : '';
  if (!text || text.startsWith(LEGACY_NOTES_PREFIX)) return null;
  return text;
}

/** Text message carrying the doctor's non-medication indications. */
export function buildIndicationsMessage({ doctorName, indications } = {}) {
  const doctor = doctorName ? `Dr. ${doctorName}` : 'tu médico';
  return `Indicaciones de tu consulta con ${doctor}:

${indications}`;
}

/** Text message carrying the insurer (obra social) prescription download link. */
export function buildExternalPrescriptionMessage({ patientName, doctorName, url } = {}) {
  const greeting = patientName ? `Hola ${patientName},` : 'Hola,';
  const doctor = doctorName ? `el Dr. ${doctorName}` : 'tu médico';
  return (
    `${greeting} te enviamos la receta de tu obra social de tu consulta con ${doctor}.

` +
    `Podés descargarla acá: ${url}

` +
    'Si tenés alguna consulta, respondé por la plataforma.'
  );
}

/**
 * Sends a prescription PDF to its patient from the company's WhatsApp number.
 *
 * Only the doctor who issued the prescription may trigger it. Every outcome
 * (sent or failed) is written to `prescription_deliveries` so the doctor can
 * see failures and retry. Returns `{ status, body }` for the HTTP layer.
 *
 * The bucket is private and every stored link is a 48h-expiring signed URL,
 * so this always mints a fresh signed URL right before fetching bytes rather
 * than trusting the (possibly expired) stored `pdf_url` — this is what makes
 * a late "Reenviar" resend reliable. Fresh rows carry `pdf_path`; legacy rows
 * (issued before this change) only have the old public `pdf_url`, so the
 * storage path is derived from it instead.
 */
export async function sendPrescriptionViaWhatsApp(
  { supabaseAdmin, waha, fetchFn = fetch, now = () => new Date() },
  { prescriptionId, requesterId }
) {
  const { data: prescription } = await supabaseAdmin
    .from('prescriptions')
    .select('id, doctor_id, patient_id, doctor_name, pdf_url, pdf_path, notes, medications, external_prescription_url')
    .eq('id', prescriptionId)
    .maybeSingle();

  if (!prescription) return { status: 404, body: { error: 'prescription_not_found' } };
  if (prescription.doctor_id !== requesterId) return { status: 403, body: { error: 'forbidden' } };

  // Obra social mode: the link replaces the internal PDF entirely.
  const externalUrl =
    typeof prescription.external_prescription_url === 'string' ? prescription.external_prescription_url.trim() : '';
  const storagePath = externalUrl
    ? null
    : prescription.pdf_path || extractStoragePathFromPublicUrl(prescription.pdf_url, PRESCRIPTIONS_PDFS_BUCKET);
  const indications = extractUsableIndications(prescription.notes);
  if (!storagePath && !externalUrl && !indications) return { status: 422, body: { error: 'no_content' } };
  // Only an indications-only prescription may go without a PDF; otherwise the
  // patient would never receive the medications while the doctor sees success.
  const hasMedications = Array.isArray(prescription.medications) && prescription.medications.length > 0;
  if (hasMedications && !externalUrl && !storagePath) return { status: 422, body: { error: 'no_pdf' } };

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

  // A previous attempt that delivered the PDF but failed on the text is marked
  // in its failed row; the retry must not send the PDF again.
  const { data: lastDelivery } = await supabaseAdmin
    .from('prescription_deliveries')
    .select('status, error')
    .eq('prescription_id', prescription.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  const pdfAlreadySent =
    lastDelivery?.status === 'failed' &&
    typeof lastDelivery.error === 'string' &&
    lastDelivery.error.startsWith(PARTIAL_PDF_SENT_MARKER);

  const { data: patient } = await supabaseAdmin
    .from('profiles')
    .select('full_name, phone')
    .eq('id', prescription.patient_id)
    .maybeSingle();

  const phone = normalizeArgentinePhone(patient?.phone);
  if (!phone) return fail(422, 'invalid_phone');

  if (!(await waha.isSessionReady())) return fail(503, 'session_not_ready');

  let bytes = null;
  if (storagePath && !pdfAlreadySent) {
    try {
      const { data: signedData, error: signError } = await supabaseAdmin.storage
        .from(PRESCRIPTIONS_PDFS_BUCKET)
        .createSignedUrl(storagePath, SIGNED_URL_TTL_SECONDS);
      if (signError || !signedData?.signedUrl) throw signError || new Error('sign_failed');

      const response = await fetchFn(signedData.signedUrl);
      if (!response.ok) throw new Error(`status ${response.status}`);
      bytes = new Uint8Array(await response.arrayBuffer());
    } catch {
      return fail(502, 'pdf_unavailable');
    }
  }

  let pdfSent = false;
  try {
    if (externalUrl) {
      await waha.sendText({
        phone,
        text: buildExternalPrescriptionMessage({
          patientName: patient?.full_name,
          doctorName: prescription.doctor_name,
          url: externalUrl,
        }),
      });
    }
    if (bytes) {
      await waha.sendFile({
        phone,
        bytes,
        filename: `receta-${String(prescription.id).slice(0, 8)}.pdf`,
        caption: buildPrescriptionMessage({
          patientName: patient?.full_name,
          doctorName: prescription.doctor_name,
        }),
      });
      pdfSent = true;
    }
    if (indications) {
      await waha.sendText({
        phone,
        text: buildIndicationsMessage({ doctorName: prescription.doctor_name, indications }),
      });
    }
  } catch (err) {
    return fail(502, `${pdfSent ? PARTIAL_PDF_SENT_MARKER + ' ' : ''}send_failed: ${err?.message || err}`);
  }

  await record('sent');
  return { status: 200, body: { status: 'sent' } };
}

// Minimum gap between two successful sends of the same payment link over
// WhatsApp. Independent from the email guard (different channel, own row).
const PAYMENT_LINK_RESEND_GUARD_MS = 60_000;

/**
 * Link-carrying message sent alongside the Mercado Pago payment link. Unlike
 * `buildPrescriptionMessage`, this one legitimately needs the URL in the text
 * since there is no attached file to carry it instead.
 */
export function buildPaymentLinkMessage({ fullName, paymentUrl } = {}) {
  const greeting = fullName ? `Hola ${fullName},` : 'Hola,';
  return (
    `${greeting} este es el link para completar el pago de tu adhesión:\n\n` +
    `${paymentUrl}\n\n` +
    'Si tenés alguna consulta, respondé por la plataforma.'
  );
}

/**
 * Sends the Mercado Pago payment link to an adhesion request's titular from
 * the company's WhatsApp number. `paymentUrl` is provided by the caller (it
 * already fetched/created it from Mercado Pago); this function only delivers
 * it. Every outcome (sent or failed) is logged to
 * `adhesion_payment_link_deliveries` so the flow can be retried. Returns
 * `{ status, body }` for the HTTP layer.
 */
export async function sendPaymentLinkViaWhatsApp(
  { supabaseAdmin, waha, now = () => new Date() },
  { adhesionRequestId, paymentUrl }
) {
  const { data: adhesion } = await supabaseAdmin
    .from('adhesion_requests')
    .select('id, titular_phone, titular_first_name, titular_last_name, titular_name')
    .eq('id', adhesionRequestId)
    .maybeSingle();

  if (!adhesion) return { status: 404, body: { error: 'adhesion_request_not_found' } };

  const record = async (status, error = null) => {
    const { error: insertError } = await supabaseAdmin.from('adhesion_payment_link_deliveries').insert({
      adhesion_request_id: adhesion.id,
      channel: 'whatsapp',
      status,
      error,
      requested_by: null,
    });
    if (insertError) console.error('[whatsapp] could not log payment link delivery:', insertError.message);
  };
  const fail = async (httpStatus, reason) => {
    await record('failed', reason.slice(0, 500));
    return { status: httpStatus, body: { status: 'failed', reason } };
  };

  const { data: lastSent } = await supabaseAdmin
    .from('adhesion_payment_link_deliveries')
    .select('created_at')
    .eq('adhesion_request_id', adhesion.id)
    .eq('channel', 'whatsapp')
    .eq('status', 'sent')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (lastSent && now() - new Date(lastSent.created_at) < PAYMENT_LINK_RESEND_GUARD_MS) {
    return { status: 409, body: { status: 'already_sent' } };
  }

  const phone = normalizeArgentinePhone(adhesion.titular_phone);
  if (!phone) return fail(422, 'invalid_phone');

  if (!(await waha.isSessionReady())) return fail(503, 'session_not_ready');

  const fullName =
    [adhesion.titular_first_name, adhesion.titular_last_name].filter(Boolean).join(' ').trim() ||
    adhesion.titular_name ||
    undefined;

  try {
    await waha.sendText({ phone, text: buildPaymentLinkMessage({ fullName, paymentUrl }) });
  } catch (err) {
    return fail(502, `send_failed: ${err?.message || err}`);
  }

  await record('sent');
  return { status: 200, body: { status: 'sent' } };
}

// server/appointmentDoctorNotice.js
//
// POST /api/appointments/:id/notify-doctor  (requireAuth)
// Heads-up WhatsApp to a doctor when a patient books an appointment with them.
// Opt-in per doctor (profiles.notify_new_appointment_whatsapp), sent from the
// company line to profiles.phone. Extracted from server.js so it can be
// unit-tested (server.js calls app.listen at import).

import { normalizeArgentinePhone } from './whatsapp.js';

const TIME_ZONE = 'America/Argentina/Buenos_Aires';

/** Argentina-local "dd/mm/yyyy" and "HH:mm" for an ISO timestamp. */
function formatLocal(scheduledAt) {
  const date = new Date(scheduledAt);
  const day = new Intl.DateTimeFormat('es-AR', { timeZone: TIME_ZONE, day: '2-digit', month: '2-digit', year: 'numeric' }).format(date);
  const time = new Intl.DateTimeFormat('es-AR', { timeZone: TIME_ZONE, hour: '2-digit', minute: '2-digit', hour12: false }).format(date);
  return { day, time };
}

export function buildAppointmentNoticeMessage({ patientName, member, scheduledAt } = {}) {
  const { day, time } = formatLocal(scheduledAt);
  const titular = patientName || 'un afiliado';
  // A family member is the one attended: name them and say whose group they belong to.
  const attended = member?.full_name ? `${member.full_name} (${member.relation} de ${titular})` : titular;
  return `Nuevo turno agendado: ${attended} el ${day} a las ${time} hs. Estate atento en tu agenda de Medinex.`;
}

/**
 * The caller must be the patient of the appointment. A doctor with the flag
 * off answers `skipped`; delivery problems answer a non-2xx so the client can
 * ignore them (booking never depends on this notice).
 */
export function notifyDoctorAppointmentHandler({ supabaseAdmin, waha }) {
  return async function notifyDoctorAppointment(req, res) {
    const { data: appointment } = await supabaseAdmin
      .from('appointments')
      .select('id, patient_id, doctor_id, scheduled_at, family_member_id')
      .eq('id', req.params.id)
      .maybeSingle();

    if (!appointment) return res.status(404).json({ status: 'failed', reason: 'appointment_not_found' });
    if (appointment.patient_id !== req.user?.id) {
      return res.status(403).json({ status: 'failed', reason: 'forbidden' });
    }

    const { data: doctor } = await supabaseAdmin
      .from('profiles')
      .select('phone, notify_new_appointment_whatsapp')
      .eq('id', appointment.doctor_id)
      .maybeSingle();

    if (!doctor?.notify_new_appointment_whatsapp) return res.status(200).json({ status: 'skipped' });

    const phone = normalizeArgentinePhone(doctor.phone);
    if (!phone) return res.status(422).json({ status: 'failed', reason: 'invalid_phone' });

    const { data: patient } = await supabaseAdmin
      .from('profiles')
      .select('full_name')
      .eq('id', appointment.patient_id)
      .maybeSingle();

    let member = null;
    if (appointment.family_member_id) {
      ({ data: member } = await supabaseAdmin
        .from('family_members')
        .select('full_name, relation')
        .eq('id', appointment.family_member_id)
        .maybeSingle());
    }

    if (!(await waha.isSessionReady())) return res.status(503).json({ status: 'failed', reason: 'session_not_ready' });

    try {
      await waha.sendText({
        phone,
        text: buildAppointmentNoticeMessage({ patientName: patient?.full_name, member, scheduledAt: appointment.scheduled_at }),
      });
    } catch (err) {
      console.error('[appointment-notice] send failed:', err?.message || err);
      return res.status(502).json({ status: 'failed', reason: 'send_failed' });
    }

    return res.status(200).json({ status: 'sent' });
  };
}

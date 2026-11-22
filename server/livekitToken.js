// server/livekitToken.js
//
// POST /api/livekit-token  (requireAuth)
// Mints a LiveKit room token for a video consultation. Only the patient or the
// doctor of the appointment gets one. Extracted from server.js so it can be
// unit-tested (server.js calls app.listen at import).

const APPOINTMENT_ID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function livekitTokenHandler({ supabaseAdmin, apiKey, apiSecret, AccessToken }) {
  return async function livekitToken(req, res) {
    try {
      const { appointmentId } = req.body || {};

      if (!appointmentId) {
        return res.status(400).json({ error: 'appointmentId is required' });
      }
      if (!APPOINTMENT_ID_REGEX.test(appointmentId)) {
        return res.status(400).json({ error: 'Invalid appointmentId format' });
      }
      if (!apiKey || !apiSecret) {
        return res.status(500).json({ error: 'LiveKit server configuration is incomplete' });
      }

      const { data: appointment, error } = await supabaseAdmin
        .from('appointments')
        .select('id, patient_id, doctor_id')
        .eq('id', appointmentId)
        .maybeSingle();

      if (error) {
        console.error('[livekit-token] appointment lookup failed:', error.message || error);
        return res.status(500).json({ error: 'No se pudo verificar el turno.' });
      }
      if (!appointment) {
        return res.status(404).json({ error: 'Turno no encontrado.' });
      }
      const userId = req.user?.id;
      if (!userId || (userId !== appointment.patient_id && userId !== appointment.doctor_id)) {
        console.warn('[livekit-token] refused, not a participant:', { appointmentId, userId });
        return res.status(403).json({ error: 'No participás de este turno.' });
      }

      const participantName = `User-${Math.floor(Math.random() * 1000)}`;
      const roomName = `room-${appointmentId}`;

      const at = new AccessToken(apiKey, apiSecret, {
        identity: participantName,
        name: participantName,
      });
      at.addGrant({ roomJoin: true, room: roomName });

      const token = await at.toJwt();
      return res.json({ token, roomName });
    } catch (error) {
      console.error('Token generation error:', error);
      return res.status(500).json({ error: error.message });
    }
  };
}

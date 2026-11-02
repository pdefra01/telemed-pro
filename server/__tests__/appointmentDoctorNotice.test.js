import { describe, it, expect, vi } from 'vitest';
import { notifyDoctorAppointmentHandler, buildAppointmentNoticeMessage } from '../appointmentDoctorNotice.js';

function createRes() {
  const res = { statusCode: null, body: null };
  res.status = (c) => { res.statusCode = c; return res; };
  res.json = (b) => { res.body = b; return res; };
  return res;
}

const APPOINTMENT = { id: 'a1', patient_id: 'pat1', doctor_id: 'doc1', scheduled_at: '2026-11-05T17:30:00.000Z' };
const DOCTOR = { phone: '387 123-4567', notify_new_appointment_whatsapp: true };
const PATIENT = { full_name: 'Juan Pérez' };

function createSupabase({ appointment = APPOINTMENT, doctor = DOCTOR, patient = PATIENT } = {}) {
  return {
    from: (table) => {
      let id;
      const b = {
        select: () => b,
        eq: (_col, value) => { id = value; return b; },
        maybeSingle: async () => {
          if (table === 'appointments') return { data: appointment, error: null };
          return { data: id === APPOINTMENT.doctor_id ? doctor : patient, error: null };
        },
      };
      return b;
    },
  };
}

function setup({ supabase = createSupabase(), ready = true, sendText = vi.fn(async () => ({})) } = {}) {
  const waha = { isSessionReady: vi.fn(async () => ready), sendText };
  return { handler: notifyDoctorAppointmentHandler({ supabaseAdmin: supabase, waha }), sendText };
}

const call = async (handler, { userId = 'pat1', id = 'a1' } = {}) => {
  const res = createRes();
  await handler({ params: { id }, user: { id: userId } }, res);
  return res;
};

describe('buildAppointmentNoticeMessage', () => {
  it('names the affiliate and the Argentina local date and time', () => {
    const text = buildAppointmentNoticeMessage({ patientName: 'Juan Pérez', scheduledAt: '2026-11-05T17:30:00.000Z' });
    expect(text).toContain('Juan Pérez');
    expect(text).toContain('05/11/2026');
    expect(text).toContain('14:30');
  });
});

describe('notifyDoctorAppointmentHandler', () => {
  it('sends the notice to the doctor phone when the flag is on', async () => {
    const { handler, sendText } = setup();
    const res = await call(handler);
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ status: 'sent' });
    expect(sendText).toHaveBeenCalledWith({
      phone: '5493871234567',
      text: expect.stringContaining('Juan Pérez'),
    });
  });

  it('skips silently when the doctor has the flag off', async () => {
    const { handler, sendText } = setup({ supabase: createSupabase({ doctor: { ...DOCTOR, notify_new_appointment_whatsapp: false } }) });
    const res = await call(handler);
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ status: 'skipped' });
    expect(sendText).not.toHaveBeenCalled();
  });

  it('refuses a caller who is not the patient of the appointment', async () => {
    const { handler, sendText } = setup();
    const res = await call(handler, { userId: 'someone-else' });
    expect(res.statusCode).toBe(403);
    expect(sendText).not.toHaveBeenCalled();
  });

  it('returns 404 when the appointment does not exist', async () => {
    const { handler } = setup({ supabase: createSupabase({ appointment: null }) });
    const res = await call(handler);
    expect(res.statusCode).toBe(404);
  });

  it('reports a failed status when the doctor phone is invalid', async () => {
    const { handler, sendText } = setup({ supabase: createSupabase({ doctor: { ...DOCTOR, phone: '123' } }) });
    const res = await call(handler);
    expect(res.statusCode).toBe(422);
    expect(sendText).not.toHaveBeenCalled();
  });

  it('reports a failed status when the WhatsApp session is not ready', async () => {
    const { handler, sendText } = setup({ ready: false });
    const res = await call(handler);
    expect(res.statusCode).toBe(503);
    expect(sendText).not.toHaveBeenCalled();
  });

  it('reports a failed status when sending throws', async () => {
    const { handler } = setup({ sendText: vi.fn(async () => { throw new Error('boom'); }) });
    const res = await call(handler);
    expect(res.statusCode).toBe(502);
  });
});

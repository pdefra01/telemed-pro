import { describe, it, expect, vi } from 'vitest';
import { runAiAssistant, AiAssistantDeps, MAX_NOTES_LENGTH } from '../aiAssistant.ts';

const DOCTOR_ID = '11111111-1111-4111-8111-111111111111';
const PATIENT_ID = '22222222-2222-4222-8222-222222222222';

// Minimal stand-in for the service-role client: auth.getUser and one user_roles lookup.
function fakeSupabase({ tokenUser = { 'doctor-token': DOCTOR_ID, 'patient-token': PATIENT_ID } as Record<string, string>, roles = { [DOCTOR_ID]: 'doctor', [PATIENT_ID]: 'patient' } as Record<string, string>, failRoles = false } = {}) {
  return {
    auth: {
      getUser: vi.fn(async (token: string) => (tokenUser[token]
        ? { data: { user: { id: tokenUser[token] } }, error: null }
        : { data: { user: null }, error: { message: 'invalid JWT' } })),
    },
    from: vi.fn(() => ({
      select: () => ({
        eq: (_col: string, userId: string) => ({
          eq: (_col2: string, role: string) => ({
            maybeSingle: async () => (failRoles
              ? { data: null, error: { message: 'db down' } }
              : { data: roles[userId] === role ? { role } : null, error: null }),
          }),
        }),
      }),
    })),
  };
}

function deps(overrides: Partial<AiAssistantDeps> = {}): AiAssistantDeps {
  return {
    supabase: fakeSupabase() as any,
    callModel: vi.fn(async () => 'S: dolor. O: normal. A: cefalea. P: reposo.'),
    ...overrides,
  };
}

const body = { action: 'professionalize_notes', notes: 'dolor de cabeza hace 2 dias' };

describe('runAiAssistant', () => {
  it('answers a signed-in doctor with the model result', async () => {
    const d = deps();
    const res = await runAiAssistant(d, { token: 'doctor-token', body });
    expect(res).toEqual({ status: 200, body: { result: 'S: dolor. O: normal. A: cefalea. P: reposo.' } });
    expect(d.callModel).toHaveBeenCalledWith(expect.stringContaining('dolor de cabeza hace 2 dias'));
  });

  it('supports the diagnosis suggestion action', async () => {
    const d = deps();
    const res = await runAiAssistant(d, { token: 'doctor-token', body: { action: 'suggest_diagnosis', notes: 'fiebre y tos' } });
    expect(res.status).toBe(200);
    expect(d.callModel).toHaveBeenCalledWith(expect.stringContaining('CIE-10'));
  });

  it('refuses a request without a session, without calling the model', async () => {
    const d = deps();
    const res = await runAiAssistant(d, { token: null, body });
    expect(res.status).toBe(401);
    expect(d.callModel).not.toHaveBeenCalled();
  });

  it('refuses an invalid token, such as the public anon key', async () => {
    const d = deps();
    const res = await runAiAssistant(d, { token: 'anon-key', body });
    expect(res.status).toBe(401);
    expect(d.callModel).not.toHaveBeenCalled();
  });

  it('refuses a signed-in user who is not a doctor', async () => {
    const d = deps();
    const res = await runAiAssistant(d, { token: 'patient-token', body });
    expect(res.status).toBe(403);
    expect(d.callModel).not.toHaveBeenCalled();
  });

  it('answers 500 when the role lookup fails, without calling the model', async () => {
    const d = deps({ supabase: fakeSupabase({ failRoles: true }) as any });
    const res = await runAiAssistant(d, { token: 'doctor-token', body });
    expect(res.status).toBe(500);
    expect(d.callModel).not.toHaveBeenCalled();
  });

  it('rejects an unknown action, empty notes and oversized notes', async () => {
    const d = deps();
    expect((await runAiAssistant(d, { token: 'doctor-token', body: { action: 'write_poem', notes: 'x' } })).status).toBe(400);
    expect((await runAiAssistant(d, { token: 'doctor-token', body: { action: 'professionalize_notes', notes: '   ' } })).status).toBe(400);
    expect((await runAiAssistant(d, { token: 'doctor-token', body: { action: 'professionalize_notes', notes: 'a'.repeat(MAX_NOTES_LENGTH + 1) } })).status).toBe(400);
    expect(d.callModel).not.toHaveBeenCalled();
  });

  it('answers 503 when the AI model is not configured', async () => {
    const res = await runAiAssistant(deps({ callModel: null }), { token: 'doctor-token', body });
    expect(res.status).toBe(503);
    expect(res.body).toEqual({ error: 'El asistente de IA no está configurado.' });
  });

  it('answers 502 when the model call fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await runAiAssistant(deps({ callModel: vi.fn(async () => { throw new Error('quota'); }) }), { token: 'doctor-token', body });
    expect(res.status).toBe(502);
  });
});

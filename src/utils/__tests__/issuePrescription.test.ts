import { describe, it, expect, vi, beforeEach } from 'vitest';
import { issueStandalonePrescription, ISSUE_PRESCRIPTION_GENERIC_ERROR } from '../issuePrescription';
import { supabase } from '../../services/supabase';

vi.mock('../../services/supabase', () => ({
  supabase: { functions: { invoke: vi.fn() } },
}));

const invoke = supabase.functions.invoke as unknown as ReturnType<typeof vi.fn>;

const input = {
  patientId: 'p-1',
  familyMemberId: null,
  medications: [{ name: 'Amoxicilina', instructions: 'Cada 8hs', productId: 'prod-1' }],
  indications: 'Reposo',
};

describe('issueStandalonePrescription', () => {
  beforeEach(() => invoke.mockReset());

  it('calls the issue-prescription edge function and returns the new prescription id', async () => {
    invoke.mockResolvedValue({ data: { prescriptionId: 'rx-9', pdfUrl: 'https://signed' }, error: null });
    await expect(issueStandalonePrescription(input)).resolves.toEqual({ ok: true, prescriptionId: 'rx-9' });
    expect(invoke).toHaveBeenCalledWith('issue-prescription', { body: input });
  });

  it('returns the server message when the function rejects the request', async () => {
    const context = new Response(JSON.stringify({ error: 'Solo un médico puede emitir recetas.' }), { status: 403 });
    invoke.mockResolvedValue({ data: null, error: { message: 'Edge Function returned a non-2xx status code', context } });
    await expect(issueStandalonePrescription(input)).resolves.toEqual({ ok: false, message: 'Solo un médico puede emitir recetas.' });
  });

  it('falls back to a generic message when there is no readable server error', async () => {
    invoke.mockResolvedValue({ data: null, error: { message: 'Failed to send a request' } });
    await expect(issueStandalonePrescription(input)).resolves.toEqual({ ok: false, message: ISSUE_PRESCRIPTION_GENERIC_ERROR });

    invoke.mockRejectedValueOnce(new Error('offline'));
    await expect(issueStandalonePrescription(input)).resolves.toEqual({ ok: false, message: ISSUE_PRESCRIPTION_GENERIC_ERROR });
  });
});

import { vi, describe, it, expect, beforeEach } from 'vitest';
import { LeadSurveyRepository, LeadSurveyResponseInput } from '../LeadSurveyRepository';
import { supabase } from '../../services/supabase';

vi.mock('../../services/supabase', () => ({
  supabase: {
    from: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    gte: vi.fn().mockReturnThis(),
    lte: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockReturnThis(),
  },
}));

const buildInput = (overrides: Partial<LeadSurveyResponseInput> = {}): LeadSurveyResponseInput => ({
  promoterCode: 'PROMO_1',
  fullName: 'Juan Pérez',
  age: 34,
  whatsapp: '3416123456',
  painPoint: 'Esperar mucho tiempo',
  whoGetsSickMore: 'Los niños',
  knewRemoteCare: true,
  interestedInEasierAccess: true,
  fairMonthlyValue: 15000,
  consentContact: true,
  ...overrides,
});

describe('LeadSurveyRepository (TDD)', () => {
  let repository: LeadSurveyRepository;
  let supabaseMock: any;

  beforeEach(() => {
    vi.clearAllMocks();
    supabaseMock = supabase as any;
    supabaseMock.from.mockReturnValue(supabaseMock);
    supabaseMock.select.mockReturnValue(supabaseMock);
    supabaseMock.insert.mockReturnValue(supabaseMock);
    supabaseMock.eq.mockReturnValue(supabaseMock);
    supabaseMock.gte.mockReturnValue(supabaseMock);
    supabaseMock.lte.mockReturnValue(supabaseMock);
    supabaseMock.order.mockReturnValue(supabaseMock);
    supabaseMock.maybeSingle.mockReturnValue(supabaseMock);
    repository = new LeadSurveyRepository();
  });

  describe('submitResponse', () => {
    it('throws when the promoter code does not match an active producer, and does not insert', async () => {
      supabaseMock.maybeSingle.mockResolvedValue({ data: null, error: null });

      await expect(repository.submitResponse(buildInput())).rejects.toThrow(
        'El código de promotor ingresado no es válido o no está activo.'
      );

      expect(supabaseMock.from).toHaveBeenCalledWith('producers');
      expect(supabaseMock.insert).not.toHaveBeenCalled();
    });

    it('succeeds with no promoter code at all, skipping producer validation entirely', async () => {
      supabaseMock.insert.mockResolvedValue({ error: null });

      await repository.submitResponse(buildInput({ promoterCode: undefined }));

      expect(supabaseMock.maybeSingle).not.toHaveBeenCalled();
      expect(supabaseMock.from).toHaveBeenCalledWith('lead_survey_responses');
      expect(supabaseMock.insert).toHaveBeenCalled();
    });

    it('inserts explicit snake_case columns, never the camelCase input shape', async () => {
      supabaseMock.maybeSingle.mockResolvedValue({ data: { id: 'prod-1' }, error: null });
      supabaseMock.insert.mockResolvedValue({ error: null });

      await repository.submitResponse(buildInput());

      expect(supabaseMock.from).toHaveBeenCalledWith('lead_survey_responses');
      expect(supabaseMock.insert).toHaveBeenCalledWith(expect.objectContaining({
        promoter_code: 'PROMO_1',
        full_name: 'Juan Pérez',
        age: 34,
        whatsapp: '3416123456',
        pain_point: 'Esperar mucho tiempo',
        who_gets_sick_more: 'Los niños',
        knew_remote_care: true,
        interested_in_easier_access: true,
        fair_monthly_value: 15000,
        consent_contact: true,
      }));

      // Never the camelCase keys — PostgREST rejects unknown columns.
      const insertedRow = supabaseMock.insert.mock.calls[0][0];
      expect(insertedRow.fullName).toBeUndefined();
      expect(insertedRow.whoGetsSickMore).toBeUndefined();
      expect(insertedRow.fairMonthlyValue).toBeUndefined();
      expect(insertedRow.consentContact).toBeUndefined();
    });

    it('omits age when not provided', async () => {
      supabaseMock.maybeSingle.mockResolvedValue({ data: { id: 'prod-1' }, error: null });
      supabaseMock.insert.mockResolvedValue({ error: null });

      await repository.submitResponse(buildInput({ age: undefined }));

      expect(supabaseMock.insert).toHaveBeenCalledWith(expect.objectContaining({ age: null }));
    });

    it('throws a friendly error when the insert fails', async () => {
      supabaseMock.maybeSingle.mockResolvedValue({ data: { id: 'prod-1' }, error: null });
      supabaseMock.insert.mockResolvedValue({ error: { message: 'insert failed' } });

      await expect(repository.submitResponse(buildInput())).rejects.toThrow('insert failed');
    });
  });

  describe('getResponses', () => {
    it('applies no filters, orders by created_at descending, and maps every row from snake_case', async () => {
      const rows = [{
        id: 'lead-1',
        promoter_code: 'PROMO_1',
        full_name: 'Juan Pérez',
        age: 34,
        whatsapp: '3416123456',
        pain_point: 'Esperar mucho tiempo',
        who_gets_sick_more: 'Los niños',
        knew_remote_care: true,
        interested_in_easier_access: false,
        fair_monthly_value: '15000', // Postgres numeric comes back as a string over PostgREST
        consent_contact: true,
        created_at: '2026-07-20T12:00:00.000Z',
      }];
      supabaseMock.order.mockResolvedValue({ data: rows, error: null });

      const result = await repository.getResponses({});

      expect(supabaseMock.from).toHaveBeenCalledWith('lead_survey_responses');
      expect(supabaseMock.eq).not.toHaveBeenCalled();
      expect(supabaseMock.gte).not.toHaveBeenCalled();
      expect(supabaseMock.lte).not.toHaveBeenCalled();
      expect(supabaseMock.order).toHaveBeenCalledWith('created_at', { ascending: false });
      expect(result).toEqual([{
        id: 'lead-1',
        promoterCode: 'PROMO_1',
        fullName: 'Juan Pérez',
        age: 34,
        whatsapp: '3416123456',
        painPoint: 'Esperar mucho tiempo',
        whoGetsSickMore: 'Los niños',
        knewRemoteCare: true,
        interestedInEasierAccess: false,
        fairMonthlyValue: 15000,
        consentContact: true,
        createdAt: '2026-07-20T12:00:00.000Z',
      }]);
    });

    it('applies promoterCode, from, and to filters only when provided', async () => {
      supabaseMock.order.mockResolvedValue({ data: [], error: null });

      await repository.getResponses({ promoterCode: 'PROMO_1', from: '2026-07-01', to: '2026-07-31T23:59:59' });

      expect(supabaseMock.eq).toHaveBeenCalledWith('promoter_code', 'PROMO_1');
      expect(supabaseMock.gte).toHaveBeenCalledWith('created_at', '2026-07-01');
      expect(supabaseMock.lte).toHaveBeenCalledWith('created_at', '2026-07-31T23:59:59');
    });

    it('applies only the promoterCode filter when from/to are omitted', async () => {
      supabaseMock.order.mockResolvedValue({ data: [], error: null });

      await repository.getResponses({ promoterCode: 'PROMO_1' });

      expect(supabaseMock.eq).toHaveBeenCalledWith('promoter_code', 'PROMO_1');
      expect(supabaseMock.gte).not.toHaveBeenCalled();
      expect(supabaseMock.lte).not.toHaveBeenCalled();
    });
  });
});

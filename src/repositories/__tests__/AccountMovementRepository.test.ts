import { describe, it, expect, vi, beforeEach } from 'vitest';
import { accountMovementRepository } from '../AccountMovementRepository';
import { supabase } from '../../services/supabase';

vi.mock('../../services/supabase', () => {
  return {
    supabase: {
      from: vi.fn(),
      rpc: vi.fn(),
    },
  };
});

describe('AccountMovementRepository', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  describe('getBalance', () => {
    it('reads the computed balance from affiliate_account_balances for the given affiliate', async () => {
      const maybeSingle = vi.fn().mockResolvedValue({ data: { balance: 4500 }, error: null });
      const eq2 = vi.fn().mockReturnValue({ maybeSingle });
      const eq1 = vi.fn().mockReturnValue({ eq: eq2 });
      const select = vi.fn().mockReturnValue({ eq: eq1 });
      vi.mocked(supabase.from).mockReturnValue({ select } as any);

      const result = await accountMovementRepository.getBalance('aff-1');

      expect(supabase.from).toHaveBeenCalledWith('affiliate_account_balances');
      expect(eq1).toHaveBeenCalledWith('entity_type', 'affiliate');
      expect(eq2).toHaveBeenCalledWith('entity_id', 'aff-1');
      expect(result).toBe(4500);
    });

    it('returns 0 (never a fabricated positive/negative number) when the affiliate has no ledger rows at all', async () => {
      const maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
      const eq2 = vi.fn().mockReturnValue({ maybeSingle });
      const eq1 = vi.fn().mockReturnValue({ eq: eq2 });
      const select = vi.fn().mockReturnValue({ eq: eq1 });
      vi.mocked(supabase.from).mockReturnValue({ select } as any);

      const result = await accountMovementRepository.getBalance('aff-no-movements');

      expect(result).toBe(0);
    });
  });

  describe('postBillingCharge', () => {
    it('calls post_billing_charge with entity_type=affiliate and maps the returned movement row', async () => {
      vi.mocked(supabase.rpc).mockResolvedValue({
        data: {
          id: 'mov-1',
          entity_type: 'affiliate',
          entity_id: 'aff-1',
          type: 'charge',
          amount: '15000.00',
          external_ref: 'charge:affiliate:aff-1:2026-07',
          invoice_id: 'inv-1',
          source: null,
          created_at: '2026-07-01T00:00:00.000Z',
        },
        error: null,
      } as any);

      const result = await accountMovementRepository.postBillingCharge({
        entityId: 'aff-1',
        period: '2026-07',
        amount: 15000,
        externalRef: 'charge:affiliate:aff-1:2026-07',
      });

      expect(supabase.rpc).toHaveBeenCalledWith('post_billing_charge', {
        p_entity_type: 'affiliate',
        p_entity_id: 'aff-1',
        p_period: '2026-07',
        p_amount: 15000,
        p_external_ref: 'charge:affiliate:aff-1:2026-07',
      });
      expect(result.id).toBe('mov-1');
      expect(result.amount).toBe(15000);
      expect(result.invoiceId).toBe('inv-1');
    });

    it('throws instead of silently succeeding when the RPC reports an error', async () => {
      vi.mocked(supabase.rpc).mockResolvedValue({ data: null, error: { message: 'boom' } } as any);

      await expect(
        accountMovementRepository.postBillingCharge({ entityId: 'aff-1', period: '2026-07', amount: 100, externalRef: 'ref' })
      ).rejects.toBeTruthy();
    });
  });

  describe('postPaymentMovement', () => {
    it('calls post_payment_movement with entity_type=affiliate and the provided source', async () => {
      vi.mocked(supabase.rpc).mockResolvedValue({
        data: {
          id: 'mov-2',
          entity_type: 'affiliate',
          entity_id: 'aff-1',
          type: 'payment',
          amount: '15000.00',
          external_ref: 'payment:manual:inv-1',
          invoice_id: 'inv-1',
          source: 'manual',
          created_at: '2026-07-05T00:00:00.000Z',
        },
        error: null,
      } as any);

      const result = await accountMovementRepository.postPaymentMovement({
        invoiceId: 'inv-1',
        entityId: 'aff-1',
        amount: 15000,
        externalRef: 'payment:manual:inv-1',
        source: 'manual',
      });

      expect(supabase.rpc).toHaveBeenCalledWith('post_payment_movement', {
        p_invoice_id: 'inv-1',
        p_entity_type: 'affiliate',
        p_entity_id: 'aff-1',
        p_amount: 15000,
        p_external_ref: 'payment:manual:inv-1',
        p_source: 'manual',
      });
      expect(result.type).toBe('payment');
      expect(result.source).toBe('manual');
    });
  });

  describe('getPaymentStatus', () => {
    it('reads the derived status from affiliate_payment_status for the given affiliate', async () => {
      const maybeSingle = vi.fn().mockResolvedValue({ data: { payment_status: 'overdue' }, error: null });
      const eq = vi.fn().mockReturnValue({ maybeSingle });
      const select = vi.fn().mockReturnValue({ eq });
      vi.mocked(supabase.from).mockReturnValue({ select } as any);

      const result = await accountMovementRepository.getPaymentStatus('aff-1');

      expect(supabase.from).toHaveBeenCalledWith('affiliate_payment_status');
      expect(result).toBe('overdue');
    });

    it('returns null (not a fabricated default) when the affiliate has no row in the view', async () => {
      const maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
      const eq = vi.fn().mockReturnValue({ maybeSingle });
      const select = vi.fn().mockReturnValue({ eq });
      vi.mocked(supabase.from).mockReturnValue({ select } as any);

      const result = await accountMovementRepository.getPaymentStatus('aff-no-row');

      expect(result).toBeNull();
    });
  });
});

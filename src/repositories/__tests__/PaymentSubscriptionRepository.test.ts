import { describe, it, expect, vi, beforeEach } from 'vitest';
import { paymentSubscriptionRepository, pickGoverningRow } from '../PaymentSubscriptionRepository';
import { supabase } from '../../services/supabase';
import { PaymentSubscription } from '../../types';

vi.mock('../../services/supabase', () => {
  return {
    supabase: {
      from: vi.fn(),
    },
  };
});

function buildRow(overrides: Partial<PaymentSubscription> = {}): PaymentSubscription {
  return {
    id: 'sub-1',
    profileId: 'profile-1',
    adhesionRequestId: null,
    mpPreapprovalId: 'preap-1',
    status: 'authorized',
    statusChangedAt: '2026-01-01T00:00:00.000Z',
    discountedMonthlyCost: 40000,
    discountThroughPeriod: null,
    lastFailureAt: null,
    failureCount: 0,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('pickGoverningRow', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  const LIVE_STATUSES: PaymentSubscription['status'][] = ['authorized', 'payment_failed'];
  const DEAD_STATUSES: PaymentSubscription['status'][] = ['pending', 'cancelled'];

  it.each(
    LIVE_STATUSES.flatMap(live => DEAD_STATUSES.map(dead => [live, dead] as const))
  )('a %s row always outranks a %s row, regardless of array order', (liveStatus, deadStatus) => {
    const live = buildRow({ id: 'sub-live', status: liveStatus, createdAt: '2026-01-01T00:00:00.000Z' });
    const dead = buildRow({ id: 'sub-dead', status: deadStatus, createdAt: '2026-06-01T00:00:00.000Z' }); // even though newer

    expect(pickGoverningRow([live, dead]).id).toBe('sub-live');
    expect(pickGoverningRow([dead, live]).id).toBe('sub-live');
  });

  it.each(
    LIVE_STATUSES.flatMap(a => LIVE_STATUSES.map(b => [a, b] as const))
  )('among two live rows (%s vs %s), the newest createdAt wins', (statusA, statusB) => {
    const older = buildRow({ id: 'sub-older', status: statusA, createdAt: '2026-01-01T00:00:00.000Z' });
    const newer = buildRow({ id: 'sub-newer', status: statusB, createdAt: '2026-03-01T00:00:00.000Z' });

    expect(pickGoverningRow([older, newer]).id).toBe('sub-newer');
    expect(pickGoverningRow([newer, older]).id).toBe('sub-newer');
  });

  it.each(
    DEAD_STATUSES.flatMap(a => DEAD_STATUSES.map(b => [a, b] as const))
  )('among two dead rows (%s vs %s), the newest createdAt still wins', (statusA, statusB) => {
    const older = buildRow({ id: 'sub-older', status: statusA, createdAt: '2026-01-01T00:00:00.000Z' });
    const newer = buildRow({ id: 'sub-newer', status: statusB, createdAt: '2026-03-01T00:00:00.000Z' });

    expect(pickGoverningRow([older, newer]).id).toBe('sub-newer');
    expect(pickGoverningRow([newer, older]).id).toBe('sub-newer');
  });

  it('breaks a tie on equal createdAt deterministically by id, stable across every array permutation', () => {
    const sameCreatedAt = '2026-05-01T00:00:00.000Z';
    const rowA = buildRow({ id: 'aaaaaaaa-0000-0000-0000-000000000000', status: 'authorized', createdAt: sameCreatedAt });
    const rowB = buildRow({ id: 'bbbbbbbb-0000-0000-0000-000000000000', status: 'authorized', createdAt: sameCreatedAt });
    const rowC = buildRow({ id: 'cccccccc-0000-0000-0000-000000000000', status: 'authorized', createdAt: sameCreatedAt });

    const permutations = [
      [rowA, rowB, rowC],
      [rowB, rowC, rowA],
      [rowC, rowA, rowB],
      [rowC, rowB, rowA],
    ];

    const winners = new Set(permutations.map(perm => pickGoverningRow(perm).id));
    expect(winners.size).toBe(1);
    expect([...winners][0]).toBe('cccccccc-0000-0000-0000-000000000000'); // lexicographically greatest id
  });

  it('returns the only row when given a single-element array', () => {
    const solo = buildRow({ id: 'sub-solo' });
    expect(pickGoverningRow([solo]).id).toBe('sub-solo');
  });
});

describe('PaymentSubscriptionRepository', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  describe('getByProfileIds', () => {
    it('returns an empty map without querying supabase when given no ids', async () => {
      const result = await paymentSubscriptionRepository.getByProfileIds([]);
      expect(result.size).toBe(0);
      expect(supabase.from).not.toHaveBeenCalled();
    });

    it('buckets rows by profile_id and reduces each bucket through pickGoverningRow', async () => {
      const rows = [
        { id: 'sub-1', profile_id: 'p1', adhesion_request_id: null, mp_preapproval_id: 'mp1', status: 'cancelled', status_changed_at: null, discounted_monthly_cost: null, discount_through_period: null, last_failure_at: null, failure_count: 0, created_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-01-01T00:00:00.000Z' },
        { id: 'sub-2', profile_id: 'p1', adhesion_request_id: null, mp_preapproval_id: 'mp2', status: 'authorized', status_changed_at: null, discounted_monthly_cost: '40000.00', discount_through_period: null, last_failure_at: null, failure_count: 0, created_at: '2026-02-01T00:00:00.000Z', updated_at: '2026-02-01T00:00:00.000Z' },
        { id: 'sub-3', profile_id: 'p2', adhesion_request_id: null, mp_preapproval_id: 'mp3', status: 'pending', status_changed_at: null, discounted_monthly_cost: null, discount_through_period: null, last_failure_at: null, failure_count: 0, created_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-01-01T00:00:00.000Z' },
      ];
      const inMock = vi.fn().mockResolvedValue({ data: rows, error: null });
      const select = vi.fn().mockReturnValue({ in: inMock });
      vi.mocked(supabase.from).mockReturnValue({ select } as any);

      const result = await paymentSubscriptionRepository.getByProfileIds(['p1', 'p2']);

      expect(supabase.from).toHaveBeenCalledWith('affiliate_payment_subscriptions');
      expect(inMock).toHaveBeenCalledWith('profile_id', ['p1', 'p2']);
      expect(result.get('p1')?.id).toBe('sub-2'); // authorized outranks cancelled
      expect(result.get('p1')?.discountedMonthlyCost).toBe(40000);
      expect(result.get('p2')?.id).toBe('sub-3');
    });

    it('throws instead of silently succeeding when the query reports an error', async () => {
      const inMock = vi.fn().mockResolvedValue({ data: null, error: { message: 'boom' } });
      const select = vi.fn().mockReturnValue({ in: inMock });
      vi.mocked(supabase.from).mockReturnValue({ select } as any);

      await expect(paymentSubscriptionRepository.getByProfileIds(['p1'])).rejects.toBeTruthy();
    });
  });

  describe('getFailedDebits', () => {
    it('queries status=payment_failed ordered by last_failure_at and maps the joined profile name', async () => {
      const rows = [
        {
          id: 'sub-failed', profile_id: 'p1', adhesion_request_id: null, mp_preapproval_id: 'mp1',
          status: 'payment_failed', status_changed_at: null, discounted_monthly_cost: '40000.00',
          discount_through_period: null, last_failure_at: '2026-06-01T00:00:00.000Z', failure_count: 2,
          created_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-06-01T00:00:00.000Z',
          profiles: { first_name: 'Juan', last_name: 'Pérez', email: 'juan@test.com' },
        },
      ];
      const order = vi.fn().mockResolvedValue({ data: rows, error: null });
      const eq = vi.fn().mockReturnValue({ order });
      const select = vi.fn().mockReturnValue({ eq });
      vi.mocked(supabase.from).mockReturnValue({ select } as any);

      const result = await paymentSubscriptionRepository.getFailedDebits();

      expect(eq).toHaveBeenCalledWith('status', 'payment_failed');
      expect(order).toHaveBeenCalledWith('last_failure_at', { ascending: false });
      expect(result).toHaveLength(1);
      expect(result[0].profileName).toBe('Juan Pérez');
      expect(result[0].failureCount).toBe(2);
    });
  });

  describe('getUnreconciledCount', () => {
    it('counts mercadopago_events rows with resolution_state in (pending, needs_admin)', async () => {
      const inMock = vi.fn().mockResolvedValue({ count: 3, error: null });
      const select = vi.fn().mockReturnValue({ in: inMock });
      vi.mocked(supabase.from).mockReturnValue({ select } as any);

      const result = await paymentSubscriptionRepository.getUnreconciledCount();

      expect(supabase.from).toHaveBeenCalledWith('mercadopago_events');
      expect(inMock).toHaveBeenCalledWith('resolution_state', ['pending', 'needs_admin']);
      expect(result).toBe(3);
    });

    it('returns 0 (not null) when count is null', async () => {
      const inMock = vi.fn().mockResolvedValue({ count: null, error: null });
      const select = vi.fn().mockReturnValue({ in: inMock });
      vi.mocked(supabase.from).mockReturnValue({ select } as any);

      const result = await paymentSubscriptionRepository.getUnreconciledCount();
      expect(result).toBe(0);
    });
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { operatingExpenseRepository } from '../OperatingExpenseRepository';
import { supabase } from '../../services/supabase';

vi.mock('../../services/supabase', () => {
  return {
    supabase: {
      from: vi.fn(),
    },
  };
});

describe('OperatingExpenseRepository', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  const rawRow = {
    id: 'exp-1',
    period: '2026-07',
    category: 'administrative',
    amount: '450000.00', // Postgres numeric comes back as a string over PostgREST
    description: 'Alquiler oficinas',
    created_at: '2026-07-06T00:00:00.000Z',
  };

  it('getByPeriod() filters by period, orders by created_at desc and maps snake_case rows to camelCase', async () => {
    const order = vi.fn().mockResolvedValue({ data: [rawRow], error: null });
    const eq = vi.fn().mockReturnValue({ order });
    const select = vi.fn().mockReturnValue({ eq });
    vi.mocked(supabase.from).mockReturnValue({ select } as any);

    const result = await operatingExpenseRepository.getByPeriod('2026-07');

    expect(supabase.from).toHaveBeenCalledWith('operating_expenses');
    expect(eq).toHaveBeenCalledWith('period', '2026-07');
    expect(order).toHaveBeenCalledWith('created_at', { ascending: false });
    expect(result).toEqual([
      {
        id: 'exp-1',
        period: '2026-07',
        category: 'administrative',
        amount: 450000,
        description: 'Alquiler oficinas',
        createdAt: '2026-07-06T00:00:00.000Z',
      },
    ]);
  });

  it('create() inserts the expense and returns the mapped created row', async () => {
    const single = vi.fn().mockResolvedValue({ data: { ...rawRow, id: 'new-id' }, error: null });
    const select = vi.fn().mockReturnValue({ single });
    const insert = vi.fn().mockReturnValue({ select });
    vi.mocked(supabase.from).mockReturnValue({ insert } as any);

    const result = await operatingExpenseRepository.create({
      period: '2026-07',
      category: 'administrative',
      amount: 450000,
      description: 'Alquiler oficinas',
    });

    expect(insert).toHaveBeenCalledWith([
      { period: '2026-07', category: 'administrative', amount: 450000, description: 'Alquiler oficinas' },
    ]);
    expect(result.id).toBe('new-id');
    expect(result.amount).toBe(450000);
  });

  it('delete() removes the expense by id', async () => {
    const eq = vi.fn().mockResolvedValue({ error: null });
    const del = vi.fn().mockReturnValue({ eq });
    vi.mocked(supabase.from).mockReturnValue({ delete: del } as any);

    await operatingExpenseRepository.delete('exp-1');

    expect(del).toHaveBeenCalled();
    expect(eq).toHaveBeenCalledWith('id', 'exp-1');
  });

  it('propagates errors from Supabase instead of swallowing them', async () => {
    const order = vi.fn().mockResolvedValue({ data: null, error: { message: 'boom' } });
    const eq = vi.fn().mockReturnValue({ order });
    const select = vi.fn().mockReturnValue({ eq });
    vi.mocked(supabase.from).mockReturnValue({ select } as any);

    await expect(operatingExpenseRepository.getByPeriod('2026-07')).rejects.toEqual({ message: 'boom' });
  });
});

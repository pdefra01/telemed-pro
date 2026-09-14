import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AdvisorDashboard } from '../AdvisorDashboard';
import { supabase } from '../../../services/supabase';
import { User } from '../../../types';

// Judgment Day finding K10: `stats.totalSales` (unlimited count) is shown as
// the "Formularios Completados" KPI while the requests table below only
// renders `stats.sales`, which the API caps at 100 rows — once an advisor
// exceeds 100 requests, the KPI and the table silently diverge with no
// indication the table is partial. A caption must appear only in that case.

vi.mock('../../../services/supabase', () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: { access_token: 'token-123' } } }),
    },
    from: vi.fn(),
  },
}));

const mockUser: User = {
  id: 'advisor-1',
  name: 'Pedro Gómez',
  email: 'pedro@medinex.com',
  role: 'advisor' as any,
  promoter_code: 'PROMO_PEDRO',
};

const buildSale = (id: string) => ({
  id,
  titular_name: `Titular ${id}`,
  titular_dni: '30123456',
  plan_type: 'Plan Familiar',
  status: 'pending' as const,
  created_at: '2026-09-01T00:00:00Z',
});

function mockSupabaseFrom() {
  vi.mocked(supabase.from).mockImplementation((table: string) => {
    if (table === 'profiles') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: null, error: null }),
          }),
        }),
      } as any;
    }
    if (table === 'lead_survey_responses') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ count: 0 }),
        }),
      } as any;
    }
    return { select: vi.fn().mockReturnValue({ eq: vi.fn() }) } as any;
  });
}

describe('AdvisorDashboard — partial-table notice (K10)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSupabaseFrom();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('shows a note when totalSales exceeds the 100-row-capped sales list', async () => {
    const sales = Array.from({ length: 100 }, (_, i) => buildSale(`s${i}`));

    vi.stubGlobal('fetch', vi.fn((url: string) => {
      if (url === '/api/advisor/stats') {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            totalSales: 137,
            approvedSales: 10,
            pendingSales: 20,
            commissions: 1000,
            linksSharedCount: 5,
            sales,
          }),
        });
      }
      return Promise.resolve({ ok: true, json: async () => ([]) });
    }));

    render(<AdvisorDashboard user={mockUser} />);

    await waitFor(() => {
      expect(
        screen.getByText('Mostrando las 100 solicitudes más recientes de 137 totales.')
      ).toBeInTheDocument();
    });
  });

  it('does NOT show the note when totalSales matches the sales list length', async () => {
    const sales = [buildSale('s1'), buildSale('s2')];

    vi.stubGlobal('fetch', vi.fn((url: string) => {
      if (url === '/api/advisor/stats') {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            totalSales: 2,
            approvedSales: 1,
            pendingSales: 1,
            commissions: 100,
            linksSharedCount: 1,
            sales,
          }),
        });
      }
      return Promise.resolve({ ok: true, json: async () => ([]) });
    }));

    render(<AdvisorDashboard user={mockUser} />);

    await waitFor(() => {
      expect(screen.getByText('Titular s1')).toBeInTheDocument();
    });

    expect(screen.queryByText(/solicitudes más recientes de/)).not.toBeInTheDocument();
  });
});

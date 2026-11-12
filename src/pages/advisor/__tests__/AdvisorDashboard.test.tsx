import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AdvisorDashboard } from '../AdvisorDashboard';
import { supabase } from '../../../services/supabase';
import { commissionRepository } from '../../../repositories/CommissionRepository';
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

vi.mock('../../../repositories/CommissionRepository', () => ({
  commissionRepository: { getSummary: vi.fn(), isVisible: vi.fn() },
}));

const commissionSummary = (toCollectAmount: number, collectedAmount: number) => ([{
  advisorId: 'advisor-1', advisorName: 'Pedro Gómez',
  generatedAmount: 0, generatedCount: 0, retainedAmount: 0, retainedCount: 0,
  toCollectAmount, toCollectCount: 1, collectedAmount, collectedCount: 1,
}]);

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

describe('AdvisorDashboard — sales pending payment', () => {
  const stubStats = (body: object) =>
    vi.stubGlobal('fetch', vi.fn((url: string) => {
      if (url === '/api/advisor/stats') {
        return Promise.resolve({ ok: true, json: async () => ({ totalSales: 3, pendingSales: 0, linksSharedCount: 10, sales: [], ...body }) });
      }
      return Promise.resolve({ ok: true, json: async () => ([]) });
    }));

  beforeEach(() => {
    vi.clearAllMocks();
    mockSupabaseFrom();
    vi.mocked(commissionRepository.getSummary).mockResolvedValue([]);
    vi.mocked(commissionRepository.isVisible).mockResolvedValue(true);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('counts only the sales with a confirmed payment as accredited', async () => {
    stubStats({ approvedSales: 3, confirmedSales: 1, unconfirmedSales: 2, commissions: 25000 });
    render(<AdvisorDashboard user={mockUser} />);

    const kpi = await screen.findByText('Altas Acreditadas');
    expect(kpi.closest('.rounded-3xl')).toHaveTextContent(/^Altas Acreditadas1/);
  });

  it('shows the commission to collect and the collected one from the liquidations, not the on-the-fly figure', async () => {
    stubStats({ approvedSales: 3, confirmedSales: 1, unconfirmedSales: 2, commissions: 25000 });
    vi.mocked(commissionRepository.getSummary).mockResolvedValue(commissionSummary(1300, 4500));
    render(<AdvisorDashboard user={mockUser} />);

    const kpi = (await screen.findByText('Comisión a cobrar')).closest('.rounded-3xl') as HTMLElement;
    await waitFor(() => expect(kpi).toHaveTextContent(/\$\s?1\.300/));
    expect(kpi).toHaveTextContent(/Cobrado \$\s?4\.500/);
    expect(kpi).not.toHaveTextContent(/25\.000/);
    expect(screen.queryByText('Comisiones Ganadas')).not.toBeInTheDocument();
  });

  it('promises the commissions on the affiliation link while the switch is on', async () => {
    stubStats({ approvedSales: 3, confirmedSales: 1, unconfirmedSales: 2 });
    render(<AdvisorDashboard user={mockUser} />);

    expect(await screen.findByText(/las comisiones se asignarán automáticamente/i)).toBeInTheDocument();
  });

  it('shows only the productivity while the switch is off', async () => {
    stubStats({ approvedSales: 3, confirmedSales: 1, unconfirmedSales: 2 });
    vi.mocked(commissionRepository.isVisible).mockResolvedValue(false);
    vi.mocked(commissionRepository.getSummary).mockResolvedValue(commissionSummary(1300, 4500));
    render(<AdvisorDashboard user={mockUser} />);

    const accredited = await screen.findByText('Altas Acreditadas');
    expect(accredited.closest('.rounded-3xl')).toHaveTextContent(/^Altas Acreditadas1/);
    expect(screen.getByText('Links Compartidos')).toBeInTheDocument();
    await waitFor(() => expect(commissionRepository.isVisible).toHaveBeenCalled());
    expect(screen.queryByText('Comisión a cobrar')).not.toBeInTheDocument();
    expect(screen.queryByText(/comisiones se asignarán/i)).not.toBeInTheDocument();
    expect(screen.getByText(/las ventas se asignarán automáticamente a tu cuenta/i)).toBeInTheDocument();
    expect(commissionRepository.getSummary).not.toHaveBeenCalled();
  });

  it('does not mention commissions on the pending-payment notice while the switch is off', async () => {
    stubStats({ approvedSales: 3, confirmedSales: 1, unconfirmedSales: 2 });
    vi.mocked(commissionRepository.isVisible).mockResolvedValue(false);
    render(<AdvisorDashboard user={mockUser} />);

    const notice = await screen.findByText(/2 ventas aprobadas con el pago pendiente/i);
    await waitFor(() => expect(commissionRepository.isVisible).toHaveBeenCalled());
    expect(notice).toHaveTextContent(/se suman a tus metas cuando se acredite el primer pago/i);
    expect(notice).not.toHaveTextContent(/comisiones/i);
  });

  it('shows zero to collect when the commission summary cannot be read', async () => {
    stubStats({ approvedSales: 3, confirmedSales: 1, unconfirmedSales: 2, commissions: 25000 });
    vi.mocked(commissionRepository.getSummary).mockRejectedValue(new Error('denied'));
    render(<AdvisorDashboard user={mockUser} />);

    const kpi = (await screen.findByText('Comisión a cobrar')).closest('.rounded-3xl') as HTMLElement;
    await waitFor(() => expect(commissionRepository.getSummary).toHaveBeenCalled());
    expect(kpi).toHaveTextContent(/\$\s?0/);
    expect(kpi).not.toHaveTextContent(/25\.000/);
  });

  it('falls back to the approved count when the server does not send confirmed sales (older server)', async () => {
    stubStats({ approvedSales: 3, commissions: 0 });
    render(<AdvisorDashboard user={mockUser} />);

    const kpi = await screen.findByText('Altas Acreditadas');
    expect(kpi.closest('.rounded-3xl')).toHaveTextContent(/^Altas Acreditadas3/);
  });

  it('warns about approved sales that wait for their first payment', async () => {
    stubStats({ approvedSales: 3, confirmedSales: 1, unconfirmedSales: 2, commissions: 25000 });
    render(<AdvisorDashboard user={mockUser} />);

    expect(await screen.findByText(/2 ventas aprobadas con el pago pendiente/i)).toBeInTheDocument();
  });

  it('uses the singular for one sale and shows no warning when there are none', async () => {
    stubStats({ approvedSales: 2, confirmedSales: 1, unconfirmedSales: 1, commissions: 0 });
    const { unmount } = render(<AdvisorDashboard user={mockUser} />);
    expect(await screen.findByText(/1 venta aprobada con el pago pendiente/i)).toBeInTheDocument();
    unmount();

    stubStats({ approvedSales: 2, confirmedSales: 2, unconfirmedSales: 0, commissions: 0 });
    render(<AdvisorDashboard user={mockUser} />);
    await screen.findByText('Altas Acreditadas');
    expect(screen.queryByText(/con el pago pendiente/i)).not.toBeInTheDocument();
  });

  it('marks each approved request as paid or pending payment in the list', async () => {
    stubStats({
      approvedSales: 2, confirmedSales: 1, unconfirmedSales: 1, commissions: 0,
      sales: [
        { ...buildSale('paid'), status: 'approved', paymentConfirmed: true },
        { ...buildSale('unpaid'), status: 'approved', paymentConfirmed: false },
        buildSale('waiting'),
      ],
    });
    render(<AdvisorDashboard user={mockUser} />);

    expect(await screen.findByText('Aprobada · pago pendiente')).toBeInTheDocument();
    expect(screen.getAllByText('Aprobada')).toHaveLength(1);
    expect(screen.getAllByText('Pendiente')).toHaveLength(1);
  });
});

describe('AdvisorDashboard — partial-table notice (K10)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSupabaseFrom();
    vi.mocked(commissionRepository.getSummary).mockResolvedValue([]);
    vi.mocked(commissionRepository.isVisible).mockResolvedValue(true);
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

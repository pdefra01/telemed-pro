import { vi, describe, it, expect, beforeEach } from 'vitest';

const calls: Array<{ table: string; method: string; args: unknown[] }> = [];
let tables: Record<string, unknown[]> = {};

vi.mock('../../services/supabase', () => ({
  supabase: {
    from: (table: string) => {
      const builder: any = {
        select: (...a: unknown[]) => { calls.push({ table, method: 'select', args: a }); return builder; },
        eq: (...a: unknown[]) => { calls.push({ table, method: 'eq', args: a }); return builder; },
        gte: (...a: unknown[]) => { calls.push({ table, method: 'gte', args: a }); return builder; },
        lt: (...a: unknown[]) => { calls.push({ table, method: 'lt', args: a }); return builder; },
        then: (resolve: (v: unknown) => unknown) => resolve({ data: tables[table] ?? [], error: null }),
      };
      return builder;
    },
  },
}));

vi.mock('../AppointmentRepository', () => ({
  appointmentRepository: { expireStaleAppointments: vi.fn().mockResolvedValue(undefined) },
}));

import { DashboardRepository } from '../DashboardRepository';

const at = (y: number, m: number, d: number, h = 12) => new Date(y, m - 1, d, h).toISOString();
const wed = new Date(2026, 3, 22, 9); // week Mon 20 – Sun 26 April 2026

describe('getAdminAnalytics: selected period vs previous period', () => {
  let repo: DashboardRepository;

  beforeEach(() => {
    calls.length = 0;
    tables = {};
    repo = new DashboardRepository();
  });

  it('weekly: returns current and previous counts aligned Lun..Dom, counting every status', async () => {
    tables.appointments = [
      { id: 'a', doctor_id: 'd1', status: 'completed', duration_minutes: 20, scheduled_at: at(2026, 4, 20) },
      { id: 'b', doctor_id: 'd1', status: 'cancelled', duration_minutes: null, scheduled_at: at(2026, 4, 20, 15) },
      { id: 'c', doctor_id: 'd1', status: 'scheduled', duration_minutes: null, scheduled_at: at(2026, 4, 22) },
      { id: 'd', doctor_id: 'd1', status: 'completed', duration_minutes: 10, scheduled_at: at(2026, 4, 14) },
      { id: 'e', doctor_id: 'd1', status: 'completed', duration_minutes: 10, scheduled_at: at(2026, 4, 1) },
    ];

    const r = await repo.getAdminAnalytics('global', 'weekly', wed);

    expect(r.timeSeries.map((p) => p.name)).toEqual(['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']);
    expect(r.timeSeries.map((p) => p.consultations)).toEqual([2, 0, 1, 0, 0, 0, 0]);
    expect(r.timeSeries.map((p) => p.previousConsultations)).toEqual([0, 1, 0, 0, 0, 0, 0]);
    expect(r.summary.totalConsultations).toBe(3);
    expect(r.summary.previousTotalConsultations).toBe(1);
    expect(r.summary.consultationTrend).toBe('+200%');
  });

  it('asks the database only for the two periods (previous start up to current end)', async () => {
    await repo.getAdminAnalytics('global', 'weekly', wed);

    const gte = calls.find((c) => c.table === 'appointments' && c.method === 'gte');
    const lt = calls.find((c) => c.table === 'appointments' && c.method === 'lt');
    expect(gte?.args).toEqual(['scheduled_at', new Date(2026, 3, 13).toISOString()]);
    expect(lt?.args).toEqual(['scheduled_at', new Date(2026, 3, 27).toISOString()]);
  });

  it('keeps filtering by doctor', async () => {
    await repo.getAdminAnalytics('doc-9', 'weekly', wed);
    expect(calls.filter((c) => c.method === 'eq').map((c) => c.args)).toEqual([
      ['doctor_id', 'doc-9'],
      ['doctor_id', 'doc-9'],
    ]);
  });

  it('daily: 2-hour blocks for the selected day against the day before', async () => {
    tables.appointments = [
      { id: 'a', doctor_id: 'd1', status: 'completed', duration_minutes: 15, scheduled_at: at(2026, 4, 22, 9) },
      { id: 'b', doctor_id: 'd1', status: 'completed', duration_minutes: 15, scheduled_at: at(2026, 4, 21, 9) },
      { id: 'c', doctor_id: 'd1', status: 'completed', duration_minutes: 15, scheduled_at: at(2026, 4, 21, 9) },
    ];
    const r = await repo.getAdminAnalytics('global', 'daily', wed);
    expect(r.timeSeries[0].name).toBe('08:00');
    expect(r.timeSeries[0].consultations).toBe(1);
    expect(r.timeSeries[0].previousConsultations).toBe(2);
    expect(r.summary.consultationTrend).toBe('-50%');
  });

  it('monthly: week-of-month buckets for the selected month against the previous month', async () => {
    tables.appointments = [
      { id: 'a', doctor_id: 'd1', status: 'completed', duration_minutes: 15, scheduled_at: at(2026, 4, 2) },
      { id: 'b', doctor_id: 'd1', status: 'completed', duration_minutes: 15, scheduled_at: at(2026, 4, 30) },
      { id: 'c', doctor_id: 'd1', status: 'completed', duration_minutes: 15, scheduled_at: at(2026, 3, 9) },
    ];
    const r = await repo.getAdminAnalytics('global', 'monthly', wed);
    expect(r.timeSeries.map((p) => p.consultations)).toEqual([1, 0, 0, 1]);
    expect(r.timeSeries.map((p) => p.previousConsultations)).toEqual([0, 1, 0, 0]);
  });

  it('an empty previous period gives "Nuevo", not a made-up percentage', async () => {
    tables.appointments = [
      { id: 'a', doctor_id: 'd1', status: 'completed', duration_minutes: 15, scheduled_at: at(2026, 4, 22) },
    ];
    const r = await repo.getAdminAnalytics('global', 'weekly', wed);
    expect(r.summary.consultationTrend).toBe('Nuevo');
  });
});

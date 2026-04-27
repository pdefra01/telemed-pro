import { vi, describe, it, expect, beforeEach } from 'vitest';
import { DashboardRepository } from '../DashboardRepository';
import { supabase } from '../../services/supabase';

// Mock de Supabase
vi.mock('../../services/supabase', () => ({
  supabase: {
    from: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    gte: vi.fn().mockReturnThis(),
    lte: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    single: vi.fn().mockReturnThis(),
  },
}));

describe('DashboardRepository (TDD)', () => {
  let repository: DashboardRepository;

  beforeEach(() => {
    vi.clearAllMocks();
    repository = new DashboardRepository();
  });

  describe('getWeeklyStats', () => {
    it('should fetch appointments and group them by day of week', async () => {
      // Setup: Appointments distributed across different days
      const mockAppointments = [
        { scheduled_at: '2026-04-20T10:00:00Z' }, // Monday
        { scheduled_at: '2026-04-20T14:00:00Z' }, // Monday
        { scheduled_at: '2026-04-21T10:00:00Z' }, // Tuesday
        { scheduled_at: '2026-04-22T10:00:00Z' }, // Wednesday
        { scheduled_at: '2026-04-22T11:00:00Z' }, // Wednesday
        { scheduled_at: '2026-04-22T12:00:00Z' }, // Wednesday
      ];

      const supabaseMock = supabase as any;
      supabaseMock.order.mockResolvedValue({ data: mockAppointments, error: null });

      const stats = await repository.getWeeklyStats();

      // Check structure: { name: 'Lun', consultations: 2 }, etc.
      expect(stats).toHaveLength(7); // 7 days of week
      
      const mon = stats.find(s => s.name === 'Lun');
      const tue = stats.find(s => s.name === 'Mar');
      const wed = stats.find(s => s.name === 'Mie');
      const thu = stats.find(s => s.name === 'Jue');

      expect(mon?.consultations).toBe(2);
      expect(tue?.consultations).toBe(1);
      expect(wed?.consultations).toBe(3);
      expect(thu?.consultations).toBe(0); // Empty day
    });

    it('should return empty stats on error', async () => {
      const supabaseMock = supabase as any;
      supabaseMock.order.mockResolvedValue({ data: null, error: { message: 'DB Error' } });

      const stats = await repository.getWeeklyStats();
      
      expect(stats).toHaveLength(7);
      expect(stats.every(s => s.consultations === 0)).toBe(true);
    });
  });

  describe('getMetrics', () => {
    it('should fetch total doctors, patients and appointments', async () => {
      const supabaseMock = supabase as any;
      
      // Reset mock to use custom implementation for getMetrics
      supabaseMock.from.mockImplementation((table: string) => {
        return {
          select: vi.fn().mockImplementation((_cols, options) => {
            // Check if it's a count query
            const isCount = options?.count === 'exact';
            
            const chain = {
              eq: vi.fn().mockImplementation((col, val) => {
                if (table === 'profiles' && col === 'role') {
                  if (val === 'doctor') return Promise.resolve({ count: 10, error: null });
                  if (val === 'patient') return Promise.resolve({ count: 100, error: null });
                }
                return Promise.resolve({ count: 0, error: null });
              }),
              // Handle queries without .eq() (like appointments)
              then: (resolve: any) => {
                if (table === 'appointments' && isCount) {
                  return resolve({ count: 50, error: null });
                }
                return resolve({ data: [], error: null });
              }
            };
            return chain;
          })
        };
      });

      const metrics = await repository.getMetrics();

      expect(metrics.totalDoctors).toBe(10);
      expect(metrics.totalAffiliates).toBe(100);
      expect(metrics.recentAppointments).toBe(50);
    });

    it('should return zeros on error', async () => {
      const supabaseMock = supabase as any;
      supabaseMock.from.mockImplementation(() => ({
        select: () => ({
          eq: () => Promise.resolve({ count: null, error: { message: 'Error' } })
        })
      }));

      const metrics = await repository.getMetrics();
      expect(metrics.totalDoctors).toBe(0);
      expect(metrics.totalAffiliates).toBe(0);
    });
  });
});

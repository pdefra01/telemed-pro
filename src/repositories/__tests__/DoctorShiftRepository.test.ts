import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DoctorShiftRepository } from '../DoctorShiftRepository';
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
    update: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockReturnThis(),
  },
}));

const HOURS = 1000 * 60 * 60;

describe('DoctorShiftRepository (TDD)', () => {
  let repository: DoctorShiftRepository;

  beforeEach(() => {
    vi.clearAllMocks();
    repository = new DoctorShiftRepository();
  });

  afterEach(() => {
    const supabaseMock = supabase as any;
    supabaseMock.from.mockReturnThis();
    supabaseMock.select.mockReturnThis();
    supabaseMock.eq.mockReturnThis();
    supabaseMock.gte.mockReturnThis();
    supabaseMock.lte.mockReturnThis();
    supabaseMock.order.mockReturnThis();
    supabaseMock.update.mockReturnThis();
    supabaseMock.maybeSingle.mockReturnThis();
  });

  describe('getActiveShift', () => {
    it('auto-abandons and returns null when clock_in is more than 8 hours old', async () => {
      const supabaseMock = supabase as any;
      const staleClockIn = new Date(Date.now() - 9 * HOURS).toISOString();

      supabaseMock.from.mockReturnValue(supabaseMock);
      supabaseMock.select.mockReturnValue(supabaseMock);
      supabaseMock.eq.mockReturnValue(supabaseMock);
      supabaseMock.order.mockReturnValue(supabaseMock);
      supabaseMock.maybeSingle.mockResolvedValue({
        data: {
          id: 'shift-1',
          doctor_id: 'doc-1',
          office_location_id: 'office-1',
          clock_in: staleClockIn,
          clock_out: null,
          duration_minutes: null,
          ip_address: '127.0.0.1',
          status: 'active',
          office_locations: { name: 'Sede Central' },
        },
        error: null,
      });
      supabaseMock.update.mockReturnValue(supabaseMock);

      const result = await repository.getActiveShift('doc-1');

      expect(result).toBeNull();
      expect(supabaseMock.update).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'abandoned',
          duration_minutes: null,
          clock_out: expect.any(String),
        })
      );
      expect(supabaseMock.eq).toHaveBeenCalledWith('id', 'shift-1');
    });

    it('returns the active shift unchanged when clock_in is within 8 hours', async () => {
      const supabaseMock = supabase as any;
      const recentClockIn = new Date(Date.now() - 1 * HOURS).toISOString();

      supabaseMock.from.mockReturnValue(supabaseMock);
      supabaseMock.select.mockReturnValue(supabaseMock);
      supabaseMock.eq.mockReturnValue(supabaseMock);
      supabaseMock.order.mockReturnValue(supabaseMock);
      supabaseMock.maybeSingle.mockResolvedValue({
        data: {
          id: 'shift-2',
          doctor_id: 'doc-1',
          office_location_id: 'office-1',
          clock_in: recentClockIn,
          clock_out: null,
          duration_minutes: null,
          ip_address: '127.0.0.1',
          status: 'active',
          office_locations: { name: 'Sede Central' },
        },
        error: null,
      });

      const result = await repository.getActiveShift('doc-1');

      expect(result).not.toBeNull();
      expect(result?.id).toBe('shift-2');
      expect(result?.status).toBe('active');
      expect(supabaseMock.update).not.toHaveBeenCalled();
    });
  });

  describe('autoCloseOldShifts (private, invoked internally by clockIn)', () => {
    it('classifies a shift older than 8 hours as abandoned with duration_minutes null', async () => {
      const supabaseMock = supabase as any;
      const staleClockIn = new Date(Date.now() - 10 * HOURS).toISOString();

      supabaseMock.from.mockReturnValue(supabaseMock);
      supabaseMock.select.mockReturnValue(supabaseMock);
      // First .eq() (doctor_id filter) chains; second .eq() (status filter) resolves the query.
      supabaseMock.eq
        .mockReturnValueOnce(supabaseMock)
        .mockResolvedValueOnce({
          data: [{ id: 'old-shift', clock_in: staleClockIn }],
          error: null,
        });
      supabaseMock.update.mockReturnValue(supabaseMock);

      await (repository as any).autoCloseOldShifts('doc-1');

      expect(supabaseMock.update).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'abandoned',
          duration_minutes: null,
          clock_out: expect.any(String),
        })
      );
    });

    it('classifies a shift within 8 hours as completed with a computed duration (unchanged behavior)', async () => {
      const supabaseMock = supabase as any;
      const recentClockIn = new Date(Date.now() - 2 * HOURS).toISOString();

      supabaseMock.from.mockReturnValue(supabaseMock);
      supabaseMock.select.mockReturnValue(supabaseMock);
      supabaseMock.eq
        .mockReturnValueOnce(supabaseMock)
        .mockResolvedValueOnce({
          data: [{ id: 'recent-shift', clock_in: recentClockIn }],
          error: null,
        });
      supabaseMock.update.mockReturnValue(supabaseMock);

      await (repository as any).autoCloseOldShifts('doc-1');

      expect(supabaseMock.update).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'completed',
          duration_minutes: expect.any(Number),
        })
      );
      const updateCallArgs = supabaseMock.update.mock.calls[0][0];
      expect(updateCallArgs.duration_minutes).toBeGreaterThan(0);
    });
  });

  describe('getShiftHistory', () => {
    it('returns every shift mapped correctly (including doctorName/officeName from the joins) when no filters are given', async () => {
      const supabaseMock = supabase as any;
      const mockRows = [
        {
          id: 'shift-1',
          doctor_id: 'doc-1',
          office_location_id: 'office-1',
          clock_in: '2026-07-20T12:00:00.000Z',
          clock_out: '2026-07-20T16:30:00.000Z',
          duration_minutes: 270,
          ip_address: '127.0.0.1',
          status: 'completed',
          doctor: { full_name: 'Dra. Ana Gómez' },
          office_locations: { name: 'Sede Central' },
        },
      ];

      supabaseMock.from.mockReturnValue(supabaseMock);
      supabaseMock.select.mockReturnValue(supabaseMock);
      supabaseMock.order.mockResolvedValue({ data: mockRows, error: null });

      const result = await repository.getShiftHistory({});

      expect(supabaseMock.from).toHaveBeenCalledWith('doctor_work_shifts');
      expect(supabaseMock.order).toHaveBeenCalledWith('clock_in', { ascending: false });
      expect(supabaseMock.eq).not.toHaveBeenCalled();
      expect(result).toEqual([
        {
          id: 'shift-1',
          doctorId: 'doc-1',
          officeLocationId: 'office-1',
          clockIn: '2026-07-20T12:00:00.000Z',
          clockOut: '2026-07-20T16:30:00.000Z',
          durationMinutes: 270,
          ipAddress: '127.0.0.1',
          status: 'completed',
          officeName: 'Sede Central',
          doctorName: 'Dra. Ana Gómez',
        },
      ]);
    });

    it('falls back to placeholder doctorName/officeName when the joins return null, without leaving them undefined', async () => {
      const supabaseMock = supabase as any;
      const mockRows = [
        {
          id: 'shift-2',
          doctor_id: 'doc-2',
          office_location_id: null,
          clock_in: '2026-07-21T09:00:00.000Z',
          clock_out: null,
          duration_minutes: null,
          ip_address: '10.0.0.5',
          status: 'active',
          doctor: null,
          office_locations: null,
        },
      ];

      supabaseMock.from.mockReturnValue(supabaseMock);
      supabaseMock.select.mockReturnValue(supabaseMock);
      supabaseMock.order.mockResolvedValue({ data: mockRows, error: null });

      const result = await repository.getShiftHistory({});

      expect(result[0].doctorName).toBe('Médico');
      expect(result[0].officeName).toBe('Oficina');
      expect(result[0].clockOut).toBeUndefined();
      expect(result[0].durationMinutes).toBeUndefined();
    });

    it('applies the doctorId filter via .eq("doctor_id", ...)', async () => {
      const supabaseMock = supabase as any;
      supabaseMock.from.mockReturnValue(supabaseMock);
      supabaseMock.select.mockReturnValue(supabaseMock);
      supabaseMock.eq.mockReturnValue(supabaseMock);
      supabaseMock.order.mockResolvedValue({ data: [], error: null });

      await repository.getShiftHistory({ doctorId: 'doc-1' });

      expect(supabaseMock.eq).toHaveBeenCalledWith('doctor_id', 'doc-1');
    });

    it('applies the officeLocationId filter via .eq("office_location_id", ...)', async () => {
      const supabaseMock = supabase as any;
      supabaseMock.from.mockReturnValue(supabaseMock);
      supabaseMock.select.mockReturnValue(supabaseMock);
      supabaseMock.eq.mockReturnValue(supabaseMock);
      supabaseMock.order.mockResolvedValue({ data: [], error: null });

      await repository.getShiftHistory({ officeLocationId: 'office-1' });

      expect(supabaseMock.eq).toHaveBeenCalledWith('office_location_id', 'office-1');
    });

    it('applies the from filter via .gte("clock_in", ...) as an inclusive lower bound', async () => {
      const supabaseMock = supabase as any;
      supabaseMock.from.mockReturnValue(supabaseMock);
      supabaseMock.select.mockReturnValue(supabaseMock);
      supabaseMock.gte.mockReturnValue(supabaseMock);
      supabaseMock.order.mockResolvedValue({ data: [], error: null });

      await repository.getShiftHistory({ from: '2026-07-01' });

      expect(supabaseMock.gte).toHaveBeenCalledWith('clock_in', '2026-07-01');
    });

    it('applies the to filter via .lte("clock_in", ...) as an inclusive upper bound', async () => {
      const supabaseMock = supabase as any;
      supabaseMock.from.mockReturnValue(supabaseMock);
      supabaseMock.select.mockReturnValue(supabaseMock);
      supabaseMock.lte.mockReturnValue(supabaseMock);
      supabaseMock.order.mockResolvedValue({ data: [], error: null });

      await repository.getShiftHistory({ to: '2026-07-31' });

      expect(supabaseMock.lte).toHaveBeenCalledWith('clock_in', '2026-07-31');
    });

    it('orders by clock_in descending (most recent first)', async () => {
      const supabaseMock = supabase as any;
      supabaseMock.from.mockReturnValue(supabaseMock);
      supabaseMock.select.mockReturnValue(supabaseMock);
      supabaseMock.order.mockResolvedValue({ data: [], error: null });

      await repository.getShiftHistory({});

      expect(supabaseMock.order).toHaveBeenCalledWith('clock_in', { ascending: false });
    });
  });
});

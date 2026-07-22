import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DoctorShiftRepository } from '../DoctorShiftRepository';
import { supabase } from '../../services/supabase';
import { officeLocationRepository } from '../OfficeLocationRepository';

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
    insert: vi.fn().mockReturnThis(),
    single: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockReturnThis(),
  },
}));

// Mock de OfficeLocationRepository (GPS + office listing)
vi.mock('../OfficeLocationRepository', () => ({
  officeLocationRepository: {
    getAllOffices: vi.fn(),
    getCurrentPosition: vi.fn(),
  },
}));

const HOURS = 1000 * 60 * 60;

describe('DoctorShiftRepository (TDD)', () => {
  let repository: DoctorShiftRepository;
  const originalLocation = window.location;

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
    supabaseMock.insert.mockReturnThis();
    supabaseMock.single.mockReturnThis();
    supabaseMock.maybeSingle.mockReturnThis();
    Object.defineProperty(window, 'location', {
      value: originalLocation,
      writable: true,
      configurable: true,
    });
  });

  function setHostname(hostname: string) {
    Object.defineProperty(window, 'location', {
      value: { ...originalLocation, hostname },
      writable: true,
      configurable: true,
    });
  }

  /**
   * Configures the shared supabase mock so that autoCloseOldShifts() (called
   * unconditionally at the start of clockIn) finds no stale open shifts,
   * and the subsequent insert().select().single() resolves with `insertedRow`.
   */
  function mockClockInPersistence(insertedRow: Record<string, any>) {
    const supabaseMock = supabase as any;

    supabaseMock.from.mockReturnValue(supabaseMock);
    supabaseMock.select.mockReturnValue(supabaseMock);
    // autoCloseOldShifts: .eq('doctor_id', ...) chains, .eq('status', 'active') resolves.
    supabaseMock.eq
      .mockReturnValueOnce(supabaseMock)
      .mockResolvedValueOnce({ data: [], error: null });
    supabaseMock.insert.mockReturnValue(supabaseMock);
    supabaseMock.single.mockResolvedValue({ data: insertedRow, error: null });
  }

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

  describe('clockIn', () => {
    const OFFICE_A = { id: 'office-a', name: 'Sede Norte', latitude: -24.7859, longitude: -65.4117, radiusMeters: 150, isActive: true };
    const OFFICE_B = { id: 'office-b', name: 'Sede Sur', latitude: -24.8000, longitude: -65.4200, radiusMeters: 150, isActive: true };
    const DOCTOR_AT_OFFICE_A = { latitude: -24.7859, longitude: -65.4117 }; // exactly at office A

    beforeEach(() => {
      setHostname('app.telemedpro.com'); // non-dev by default in these tests
    });

    it('matches the office whose radius contains the doctor\'s position', async () => {
      const officeMock = officeLocationRepository as any;
      officeMock.getAllOffices.mockResolvedValue([OFFICE_A, OFFICE_B]);
      officeMock.getCurrentPosition.mockResolvedValue(DOCTOR_AT_OFFICE_A);

      mockClockInPersistence({
        id: 'shift-new',
        doctor_id: 'doc-1',
        office_location_id: OFFICE_A.id,
        clock_in: new Date().toISOString(),
        ip_address: null,
        status: 'active',
      });

      const result = await repository.clockIn('doc-1');

      expect(result.matchedOffice.id).toBe(OFFICE_A.id);
      expect(result.shift.officeName).toBe(OFFICE_A.name);
    });

    it('rejects with the nearest-distance message when outside every radius', async () => {
      const officeMock = officeLocationRepository as any;
      const FAR_AWAY = { latitude: -34.6037, longitude: -58.3816 }; // Buenos Aires, far from Salta offices
      officeMock.getAllOffices.mockResolvedValue([OFFICE_A, OFFICE_B]);
      officeMock.getCurrentPosition.mockResolvedValue(FAR_AWAY);

      await expect(repository.clockIn('doc-1')).rejects.toThrow(
        /Acceso denegado: no estás dentro del radio de ninguna oficina autorizada\. La oficina más cercana está a \d+m\./
      );
    });

    it('picks the nearest office when radii overlap', async () => {
      const officeMock = officeLocationRepository as any;
      // Both offices are close enough (large radius) that the doctor's position falls
      // within both radii; office A is closer to the doctor's actual position.
      const WIDE_OFFICE_A = { ...OFFICE_A, radiusMeters: 5000 };
      const WIDE_OFFICE_B = { ...OFFICE_B, radiusMeters: 5000 };
      officeMock.getAllOffices.mockResolvedValue([WIDE_OFFICE_B, WIDE_OFFICE_A]); // B listed first
      officeMock.getCurrentPosition.mockResolvedValue(DOCTOR_AT_OFFICE_A);

      mockClockInPersistence({
        id: 'shift-new',
        doctor_id: 'doc-1',
        office_location_id: WIDE_OFFICE_A.id,
        clock_in: new Date().toISOString(),
        ip_address: null,
        status: 'active',
      });

      const result = await repository.clockIn('doc-1');

      expect(result.matchedOffice.id).toBe(OFFICE_A.id);
    });

    it('propagates the permission-denied message untouched when geolocation is denied', async () => {
      const officeMock = officeLocationRepository as any;
      officeMock.getAllOffices.mockResolvedValue([OFFICE_A]);
      officeMock.getCurrentPosition.mockRejectedValue(
        new Error('Activá los permisos de ubicación en tu navegador para poder fichar.')
      );

      await expect(repository.clockIn('doc-1')).rejects.toThrow(
        'Activá los permisos de ubicación en tu navegador para poder fichar.'
      );
    });

    it('skips GPS entirely and uses the first active office in dev/local environments', async () => {
      setHostname('localhost');
      const officeMock = officeLocationRepository as any;
      officeMock.getAllOffices.mockResolvedValue([OFFICE_A, OFFICE_B]);

      mockClockInPersistence({
        id: 'shift-new',
        doctor_id: 'doc-1',
        office_location_id: OFFICE_A.id,
        clock_in: new Date().toISOString(),
        ip_address: null,
        status: 'active',
      });

      const result = await repository.clockIn('doc-1');

      expect(officeMock.getCurrentPosition).not.toHaveBeenCalled();
      expect(result.matchedOffice.id).toBe(OFFICE_A.id);
    });

    it('falls back to a synthetic dev office when no active offices exist in dev/local environments', async () => {
      setHostname('127.0.0.1');
      const officeMock = officeLocationRepository as any;
      officeMock.getAllOffices.mockResolvedValue([]);

      mockClockInPersistence({
        id: 'shift-new',
        doctor_id: 'doc-1',
        office_location_id: null,
        clock_in: new Date().toISOString(),
        ip_address: null,
        status: 'active',
      });

      const result = await repository.clockIn('doc-1');

      expect(officeMock.getCurrentPosition).not.toHaveBeenCalled();
      expect(result.matchedOffice.id).toBe('dev-office');
      expect(result.shift.officeLocationId).toBeNull();
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

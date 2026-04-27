import { vi, describe, it, expect, beforeEach } from 'vitest';
import { DoctorRepository } from '../DoctorRepository';
import { supabase } from '../../services/supabase';

// Mock de Supabase
vi.mock('../../services/supabase', () => ({
  supabase: {
    from: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    not: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
  },
}));

describe('DoctorRepository (TDD)', () => {
  let repository: DoctorRepository;

  beforeEach(() => {
    vi.clearAllMocks();
    repository = new DoctorRepository();
  });

  describe('getDoctorsBySpecialty', () => {
    it('should fetch doctors filtered by specialty', async () => {
      const mockDoctors = [
        { id: 'd1', full_name: 'Dr. House', role: 'doctor', specialty: 'Diagnóstico' },
      ];

      const supabaseMock = supabase as any;
      supabaseMock.order.mockResolvedValue({ data: mockDoctors, error: null });

      const doctors = await repository.getDoctorsBySpecialty('Diagnóstico');

      expect(doctors).toHaveLength(1);
      expect(doctors[0].name).toBe('Dr. House');
      expect(supabaseMock.from).toHaveBeenCalledWith('profiles');
      expect(supabaseMock.eq).toHaveBeenCalledWith('specialty', 'Diagnóstico');
    });
  });

  describe('getSpecialties', () => {
    it('should fetch a unique list of specialties', async () => {
      const mockData = [
        { specialty: 'Cardiología' },
        { specialty: 'Pediatría' },
        { specialty: 'Cardiología' },
      ];

      const supabaseMock = supabase as any;
      supabaseMock.not.mockResolvedValue({ data: mockData, error: null });

      const specialties = await repository.getSpecialties();

      expect(specialties).toContain('Cardiología');
      expect(specialties).toContain('Pediatría');
      expect(specialties).toHaveLength(2); // Unique values
    });
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { authRepository } from '../AuthRepository';
import { supabase } from '../../services/supabase';

vi.mock('../../services/supabase', () => {
  return {
    supabase: {
      auth: {
        signInWithPassword: vi.fn()
      },
      from: vi.fn()
    }
  };
});

describe('AuthRepository', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it('should sign in successfully if user is active', async () => {
    const mockAuthUser = {
      user: {
        id: 'active-user-id',
        email: 'test@medinex.com'
      }
    };

    const mockProfileData = {
      id: 'active-user-id',
      full_name: 'Juan Perez',
      email: 'test@medinex.com',
      role: 'patient',
      is_active: true,
      plan_status: 'active',
      payment_status: 'paid'
    };

    vi.mocked(supabase.auth.signInWithPassword).mockResolvedValueOnce({
      data: mockAuthUser,
      error: null
    } as any);

    const singleMock = vi.fn().mockResolvedValueOnce({ data: mockProfileData, error: null });
    const eqMock = vi.fn().mockReturnValue({ single: singleMock });
    const selectMock = vi.fn().mockReturnValue({ eq: eqMock });
    vi.mocked(supabase.from).mockReturnValue({ select: selectMock } as any);

    const user = await authRepository.login('test@medinex.com', 'password123', 'patient');

    expect(supabase.auth.signInWithPassword).toHaveBeenCalledWith({
      email: 'test@medinex.com',
      password: 'password123'
    });
    expect(user.id).toBe('active-user-id');
    expect(user.name).toBe('Juan Perez');
  });

  it('never fabricates a fake plan name ("Plan Global") when profile.plan_name is absent — reports the honest "Sin plan asignado" state', async () => {
    const mockAuthUser = {
      user: {
        id: 'no-plan-user-id',
        email: 'noplan@medinex.com'
      }
    };

    const mockProfileData = {
      id: 'no-plan-user-id',
      full_name: 'Sin Plan',
      email: 'noplan@medinex.com',
      role: 'patient',
      is_active: true,
      plan_status: 'active',
      payment_status: 'paid',
      plan_name: null
    };

    vi.mocked(supabase.auth.signInWithPassword).mockResolvedValueOnce({
      data: mockAuthUser,
      error: null
    } as any);

    const singleMock = vi.fn().mockResolvedValueOnce({ data: mockProfileData, error: null });
    const eqMock = vi.fn().mockReturnValue({ single: singleMock });
    const selectMock = vi.fn().mockReturnValue({ eq: eqMock });
    vi.mocked(supabase.from).mockReturnValue({ select: selectMock } as any);

    const user: any = await authRepository.login('noplan@medinex.com', 'password123', 'patient');

    expect(user.planName).toBe('Sin plan asignado');
    expect(user.planName).not.toBe('Plan Global');
  });

  it('should throw an error during login if user is inactive (is_active = false)', async () => {
    const mockAuthUser = {
      user: {
        id: 'inactive-user-id',
        email: 'pending@medinex.com'
      }
    };

    const mockProfileData = {
      id: 'inactive-user-id',
      full_name: 'Paciente Pendiente',
      email: 'pending@medinex.com',
      role: 'patient',
      is_active: false,
      plan_status: 'pending',
      payment_status: 'paid'
    };

    vi.mocked(supabase.auth.signInWithPassword).mockResolvedValueOnce({
      data: mockAuthUser,
      error: null
    } as any);

    const singleMock = vi.fn().mockResolvedValueOnce({ data: mockProfileData, error: null });
    const eqMock = vi.fn().mockReturnValue({ single: singleMock });
    const selectMock = vi.fn().mockReturnValue({ eq: eqMock });
    vi.mocked(supabase.from).mockReturnValue({ select: selectMock } as any);

    await expect(authRepository.login('pending@medinex.com', 'password123', 'patient'))
      .rejects
      .toThrow('Tu cuenta está inactiva o pendiente de aprobación por administración. Por favor, contactate con soporte.');
  });
});

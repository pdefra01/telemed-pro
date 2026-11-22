import { describe, it, expect, vi, beforeEach } from 'vitest';
import { authRepository } from '../AuthRepository';
import { clearStoredAuthSession, supabase } from '../../services/supabase';

vi.mock('../../services/supabase', () => {
  return {
    supabase: {
      auth: {
        signInWithPassword: vi.fn(),
        signOut: vi.fn().mockResolvedValue({ error: null })
      },
      from: vi.fn()
    },
    clearStoredAuthSession: vi.fn()
  };
});

/** Builds the `profiles` select().eq().single() chain. */
const profileChain = (data: any, error: any = null) => ({
  select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ single: vi.fn().mockResolvedValue({ data, error }) }) }),
});

/** Builds the `affiliate_payment_status` select().eq().maybeSingle() chain. */
const paymentStatusChain = (data: any, error: any = null) => ({
  select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data, error }) }) }),
});

/** Routes supabase.from() by table name so the queries in login() resolve independently. */
function mockFromByTable(profileData: any, paymentStatusRow: any = null, paymentStatusError: any = null, cancellationRow: any = null, cancellationError: any = null) {
  vi.mocked(supabase.from).mockImplementation((table: string) =>
    (table === 'affiliate_payment_status'
      ? paymentStatusChain(paymentStatusRow, paymentStatusError)
      : table === 'affiliate_cancellations'
        ? paymentStatusChain(cancellationRow, cancellationError)
        : profileChain(profileData)) as any
  );
}

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
      agreement_id: null,
    };

    vi.mocked(supabase.auth.signInWithPassword).mockResolvedValueOnce({
      data: mockAuthUser,
      error: null
    } as any);

    mockFromByTable(mockProfileData, { payment_status: 'current' });

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
      agreement_id: null,
      plan_name: null
    };

    vi.mocked(supabase.auth.signInWithPassword).mockResolvedValueOnce({
      data: mockAuthUser,
      error: null
    } as any);

    mockFromByTable(mockProfileData);

    const user: any = await authRepository.login('noplan@medinex.com', 'password123', 'patient');

    expect(user.planName).toBe('Sin plan asignado');
    expect(user.planName).not.toBe('Plan Global');
  });

  describe('affiliate cancellation (affiliate-cancellation S1)', () => {
    const activePatient = {
      id: 'cancel-user-id',
      full_name: 'Paciente Baja',
      email: 'baja@medinex.com',
      role: 'patient',
      is_active: true,
      plan_status: 'active',
      agreement_id: null,
    };

    it('blocks the login once the cancellation is effective, before the sweep runs', async () => {
      vi.mocked(supabase.auth.signInWithPassword).mockResolvedValueOnce({
        data: { user: { id: 'cancel-user-id', email: 'baja@medinex.com' } }, error: null,
      } as any);
      mockFromByTable(activePatient, { payment_status: 'current' }, null, { effective_at: new Date(Date.now() - 60_000).toISOString() });

      await expect(authRepository.login('baja@medinex.com', 'password123', 'patient'))
        .rejects.toThrow('Tu afiliación fue dada de baja. Si querés volver a afiliarte, contactate con administración.');
      expect(supabase.auth.signOut).toHaveBeenCalledTimes(1);
    });

    it('blocks the login and signs out when the cancellation lookup fails (fail closed)', async () => {
      vi.mocked(supabase.auth.signInWithPassword).mockResolvedValueOnce({
        data: { user: { id: 'cancel-user-id', email: 'baja@medinex.com' } }, error: null,
      } as any);
      mockFromByTable(activePatient, { payment_status: 'current' }, null, null, { message: 'network error' });

      await expect(authRepository.login('baja@medinex.com', 'password123', 'patient'))
        .rejects.toThrow('No pudimos verificar el estado de tu afiliación. Intentá de nuevo en unos minutos.');
      expect(supabase.auth.signOut).toHaveBeenCalledTimes(1);

      expect(clearStoredAuthSession).not.toHaveBeenCalled();
    });

    it('clears the stored session when the sign-out returns an error', async () => {
      vi.mocked(supabase.auth.signInWithPassword).mockResolvedValueOnce({
        data: { user: { id: 'cancel-user-id', email: 'baja@medinex.com' } }, error: null,
      } as any);
      vi.mocked(supabase.auth.signOut).mockResolvedValueOnce({ error: { message: 'network error' } } as any);
      mockFromByTable(activePatient, { payment_status: 'current' }, null, null, { message: 'network error' });

      await expect(authRepository.login('baja@medinex.com', 'password123', 'patient'))
        .rejects.toThrow('No pudimos verificar el estado de tu afiliación. Intentá de nuevo en unos minutos.');
      expect(supabase.auth.signOut).toHaveBeenCalledTimes(1);
      expect(clearStoredAuthSession).toHaveBeenCalledTimes(1);
    });

    it('clears the stored session and keeps the block message when the sign-out throws', async () => {
      vi.mocked(supabase.auth.signInWithPassword).mockResolvedValueOnce({
        data: { user: { id: 'cancel-user-id', email: 'baja@medinex.com' } }, error: null,
      } as any);
      vi.mocked(supabase.auth.signOut).mockRejectedValueOnce(new Error('boom'));
      mockFromByTable(activePatient, { payment_status: 'current' }, null, { effective_at: '2020-01-01T00:00:00Z' });

      await expect(authRepository.login('baja@medinex.com', 'password123', 'patient'))
        .rejects.toThrow('Tu afiliación fue dada de baja. Si querés volver a afiliarte, contactate con administración.');
      expect(supabase.auth.signOut).toHaveBeenCalledTimes(1);
      expect(clearStoredAuthSession).toHaveBeenCalledTimes(1);
    });

    it('still lets a scheduled cancellation log in until its date', async () => {
      vi.mocked(supabase.auth.signInWithPassword).mockResolvedValueOnce({
        data: { user: { id: 'cancel-user-id', email: 'baja@medinex.com' } }, error: null,
      } as any);
      mockFromByTable(activePatient, { payment_status: 'current' }, null, { effective_at: new Date(Date.now() + 86_400_000).toISOString() });

      const user = await authRepository.login('baja@medinex.com', 'password123', 'patient');
      expect(user.id).toBe('cancel-user-id');
      expect(supabase.auth.signOut).not.toHaveBeenCalled();
    });
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
      agreement_id: null,
    };

    vi.mocked(supabase.auth.signInWithPassword).mockResolvedValueOnce({
      data: mockAuthUser,
      error: null
    } as any);

    mockFromByTable(mockProfileData);

    await expect(authRepository.login('pending@medinex.com', 'password123', 'patient'))
      .rejects
      .toThrow('Tu cuenta está inactiva o pendiente de aprobación por administración. Por favor, contactate con soporte.');
    expect(supabase.auth.signOut).toHaveBeenCalledTimes(1);
  });

  describe('profile read (login-profile-read-fail-closed)', () => {
    const mockProfileRead = (profileError: any, insertError: any = null) => {
      const insert = vi.fn().mockResolvedValue({ error: insertError });
      vi.mocked(supabase.from).mockImplementation(() => ({ ...profileChain(null, profileError), insert }) as any);
      return insert;
    };

    it('blocks the login and signs out when the profile read fails, without creating a profile', async () => {
      vi.mocked(supabase.auth.signInWithPassword).mockResolvedValueOnce({
        data: { user: { id: 'user-id', email: 'user@medinex.com' } }, error: null,
      } as any);
      const insert = mockProfileRead({ code: 'PGRST301', message: 'network error' });

      await expect(authRepository.login('user@medinex.com', 'password123', 'patient'))
        .rejects.toThrow('No pudimos verificar tu cuenta. Intentá de nuevo en unos minutos.');
      expect(supabase.auth.signOut).toHaveBeenCalledTimes(1);
      expect(insert).not.toHaveBeenCalled();
    });

    it('blocks the login when the profile read fails at the network level (no error code)', async () => {
      vi.mocked(supabase.auth.signInWithPassword).mockResolvedValueOnce({
        data: { user: { id: 'user-id', email: 'user@medinex.com' } }, error: null,
      } as any);
      const insert = mockProfileRead({ code: '', message: 'TypeError: Failed to fetch' });

      await expect(authRepository.login('user@medinex.com', 'password123', 'patient'))
        .rejects.toThrow('No pudimos verificar tu cuenta. Intentá de nuevo en unos minutos.');
      expect(insert).not.toHaveBeenCalled();
    });

    it('still creates the missing profile when the user has none (PGRST116)', async () => {
      vi.mocked(supabase.auth.signInWithPassword).mockResolvedValueOnce({
        data: { user: { id: 'user-id', email: 'user@medinex.com' } }, error: null,
      } as any);
      const insert = mockProfileRead({ code: 'PGRST116', message: 'no rows' });

      const user = await authRepository.login('user@medinex.com', 'password123', 'patient');
      expect(user).toEqual({ id: 'user-id', name: 'Usuario Autogenerado', email: 'user@medinex.com', role: 'patient' });
      expect(insert).toHaveBeenCalledWith({ id: 'user-id', role: 'patient', full_name: 'Usuario Autogenerado' });
      expect(supabase.auth.signOut).not.toHaveBeenCalled();
    });

    it('blocks the login and signs out when the missing profile cannot be created', async () => {
      vi.mocked(supabase.auth.signInWithPassword).mockResolvedValueOnce({
        data: { user: { id: 'user-id', email: 'user@medinex.com' } }, error: null,
      } as any);
      mockProfileRead({ code: 'PGRST116', message: 'no rows' }, { message: 'insert denied' });

      await expect(authRepository.login('user@medinex.com', 'password123', 'patient'))
        .rejects.toThrow('Error en la base de datos: Usuario sin perfil asociado.');
      expect(supabase.auth.signOut).toHaveBeenCalledTimes(1);
    });
  });

  describe('login() error code (D6 — lets Auth.tsx distinguish invalid credentials from inactive account)', () => {
    it('attaches code = "invalid_credentials" when Supabase rejects the credentials', async () => {
      vi.mocked(supabase.auth.signInWithPassword).mockResolvedValueOnce({
        data: { user: null },
        error: { message: 'Invalid login credentials' }
      } as any);

      await expect(authRepository.login('30123456@medinex-paciente.com', 'wrong', 'patient'))
        .rejects
        .toMatchObject({ code: 'invalid_credentials' });
    });

    it('does NOT attach code = "invalid_credentials" to the inactive-account error', async () => {
      const mockAuthUser = { user: { id: 'inactive-user-id', email: 'pending@medinex.com' } };
      vi.mocked(supabase.auth.signInWithPassword).mockResolvedValueOnce({
        data: mockAuthUser,
        error: null
      } as any);
      mockFromByTable({
        id: 'inactive-user-id',
        full_name: 'Paciente Pendiente',
        role: 'patient',
        is_active: false,
        plan_status: 'pending',
        agreement_id: null,
      });

      let caught: any;
      try {
        await authRepository.login('pending@medinex.com', 'password123', 'patient');
      } catch (err) {
        caught = err;
      }

      expect(caught).toBeDefined();
      expect(caught.code).not.toBe('invalid_credentials');
    });
  });

  describe('login() derived paymentStatus (cuenta-corriente-billing)', () => {
    const activeAuthUser = { user: { id: 'aff-1', email: 'aff@medinex.com' } };
    const baseProfile = {
      id: 'aff-1',
      full_name: 'Afiliado Uno',
      email: 'aff@medinex.com',
      role: 'patient',
      is_active: true,
      plan_status: 'active',
      agreement_id: null,
    };

    it('never reads the deprecated raw profiles.payment_status column (a fresh row still carries the old DB default "paid")', async () => {
      vi.mocked(supabase.auth.signInWithPassword).mockResolvedValueOnce({ data: activeAuthUser, error: null } as any);
      // Simulates the real Postgres state: the column's DEFAULT is still
      // 'paid' (pre-rename vocabulary) since nothing writes to it anymore.
      mockFromByTable({ ...baseProfile, payment_status: 'paid' }, { payment_status: 'overdue' });

      const user: any = await authRepository.login('aff@medinex.com', 'x', 'patient');

      // Must reflect the DERIVED view's value, never the stale raw column.
      expect(user.paymentStatus).toBe('overdue');
    });

    it('resolves the real derived status from affiliate_payment_status for a direct affiliate', async () => {
      vi.mocked(supabase.auth.signInWithPassword).mockResolvedValueOnce({ data: activeAuthUser, error: null } as any);
      mockFromByTable(baseProfile, { payment_status: 'pending' });

      const user: any = await authRepository.login('aff@medinex.com', 'x', 'patient');

      expect(supabase.from).toHaveBeenCalledWith('affiliate_payment_status');
      expect(user.paymentStatus).toBe('pending');
    });

    it('defaults to "current" (never a fabricated guess) when the affiliate has no ledger row yet', async () => {
      vi.mocked(supabase.auth.signInWithPassword).mockResolvedValueOnce({ data: activeAuthUser, error: null } as any);
      mockFromByTable(baseProfile, null); // no row for this entity yet

      const user: any = await authRepository.login('aff@medinex.com', 'x', 'patient');

      expect(user.paymentStatus).toBe('current');
    });

    it('defaults to "current" (never crashes the login) if the derived-status query itself errors', async () => {
      vi.mocked(supabase.auth.signInWithPassword).mockResolvedValueOnce({ data: activeAuthUser, error: null } as any);
      mockFromByTable(baseProfile, null, { message: 'view unavailable' });

      const user: any = await authRepository.login('aff@medinex.com', 'x', 'patient');

      expect(user.paymentStatus).toBe('current');
    });

    it('never queries affiliate_payment_status for an agreement-linked patient — always "current"', async () => {
      vi.mocked(supabase.auth.signInWithPassword).mockResolvedValueOnce({ data: activeAuthUser, error: null } as any);
      mockFromByTable({ ...baseProfile, agreement_id: 'agr-1' });

      const user: any = await authRepository.login('aff@medinex.com', 'x', 'patient');

      expect(supabase.from).not.toHaveBeenCalledWith('affiliate_payment_status');
      expect(user.paymentStatus).toBe('current');
    });

    it('never queries affiliate_payment_status for a non-patient role (e.g. doctor)', async () => {
      vi.mocked(supabase.auth.signInWithPassword).mockResolvedValueOnce({ data: activeAuthUser, error: null } as any);
      mockFromByTable({ ...baseProfile, role: 'doctor' });

      await authRepository.login('aff@medinex.com', 'x', 'doctor');

      expect(supabase.from).not.toHaveBeenCalledWith('affiliate_payment_status');
    });
  });
});

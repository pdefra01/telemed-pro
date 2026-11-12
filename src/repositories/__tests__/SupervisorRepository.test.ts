import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SupervisorRepository } from '../SupervisorRepository';
import { supabase } from '../../services/supabase';

vi.mock('../../services/supabase', () => ({
  supabase: {
    from: vi.fn(),
    auth: { getSession: vi.fn() },
  },
}));

/** Chainable, awaitable stand-in for a PostgREST query builder. */
function chain(result: { data?: unknown; error?: unknown }) {
  const c: any = {};
  for (const m of ['select', 'order', 'eq', 'update']) c[m] = vi.fn(() => c);
  c.then = (resolve: any, reject: any) => Promise.resolve({ data: null, error: null, ...result }).then(resolve, reject);
  return c;
}

describe('SupervisorRepository', () => {
  let repository: SupervisorRepository;

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    repository = new SupervisorRepository();
  });

  it('lists supervisors by name', async () => {
    const q = chain({ data: [{ id: 's-1', full_name: 'Ana Gómez', email: 'ana@test.local', phone: null }] });
    vi.mocked(supabase.from).mockReturnValueOnce(q);

    const result = await repository.listSupervisors();

    expect(supabase.from).toHaveBeenCalledWith('profiles');
    expect(q.eq).toHaveBeenCalledWith('role', 'supervisor');
    expect(q.order).toHaveBeenCalledWith('full_name', { ascending: true });
    expect(result).toEqual([{ id: 's-1', name: 'Ana Gómez', email: 'ana@test.local', phone: undefined }]);
  });

  it('lists advisors with the supervisor they belong to', async () => {
    const q = chain({
      data: [
        { id: 'a-1', full_name: 'Pedro Gómez', email: 'pedro@test.local', supervisor_id: 's-1' },
        { id: 'a-2', full_name: 'Luis Paz', email: 'luis@test.local', supervisor_id: null },
      ],
    });
    vi.mocked(supabase.from).mockReturnValueOnce(q);

    const result = await repository.listAdvisors();

    expect(q.eq).toHaveBeenCalledWith('role', 'advisor');
    expect(result).toEqual([
      { id: 'a-1', name: 'Pedro Gómez', email: 'pedro@test.local', supervisorId: 's-1' },
      { id: 'a-2', name: 'Luis Paz', email: 'luis@test.local', supervisorId: null },
    ]);
  });

  it('throws the database error when listing fails', async () => {
    vi.mocked(supabase.from).mockReturnValueOnce(chain({ error: new Error('denied') }));
    await expect(repository.listSupervisors()).rejects.toThrow('denied');
  });

  it('assigns an advisor to a supervisor', async () => {
    const q = chain({});
    vi.mocked(supabase.from).mockReturnValueOnce(q);

    await repository.assignAdvisor('a-1', 's-1');

    expect(q.update).toHaveBeenCalledWith({ supervisor_id: 's-1' });
    expect(q.eq).toHaveBeenCalledWith('id', 'a-1');
  });

  it('releases an advisor from their supervisor', async () => {
    const q = chain({});
    vi.mocked(supabase.from).mockReturnValueOnce(q);

    await repository.assignAdvisor('a-1', null);

    expect(q.update).toHaveBeenCalledWith({ supervisor_id: null });
  });

  it('throws the database error when the assignment is rejected', async () => {
    vi.mocked(supabase.from).mockReturnValueOnce(chain({ error: new Error('El supervisor asignado debe tener rol de supervisor.') }));
    await expect(repository.assignAdvisor('a-1', 'x')).rejects.toThrow(/rol de supervisor/);
  });

  describe('createSupervisor', () => {
    const input = { email: 'ana@test.local', password: 'secret123', firstName: 'Ana', lastName: 'Gómez', phone: '3875' };

    it('posts to /api/create-supervisor with the session Bearer token and returns the new id', async () => {
      vi.mocked(supabase.auth.getSession).mockResolvedValueOnce({ data: { session: { access_token: 'admin-jwt' } } } as any);
      const fetchSpy = vi.spyOn(window, 'fetch').mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, id: 's-9' }),
      } as Response);

      const id = await repository.createSupervisor(input);

      expect(id).toBe('s-9');
      expect(fetchSpy).toHaveBeenCalledWith('/api/create-supervisor', expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'Content-Type': 'application/json',
          'Authorization': 'Bearer admin-jwt',
        }),
        body: JSON.stringify(input),
      }));
    });

    it('throws the server message when the request is refused', async () => {
      vi.mocked(supabase.auth.getSession).mockResolvedValueOnce({ data: { session: null } } as any);
      vi.spyOn(window, 'fetch').mockResolvedValueOnce({
        ok: false,
        json: async () => ({ error: 'User already registered' }),
      } as Response);

      await expect(repository.createSupervisor(input)).rejects.toThrow('User already registered');
    });

    it('falls back to a generic message when the server sends none', async () => {
      vi.mocked(supabase.auth.getSession).mockResolvedValueOnce({ data: { session: null } } as any);
      vi.spyOn(window, 'fetch').mockResolvedValueOnce({ ok: false, json: async () => { throw new Error('no body'); } } as unknown as Response);

      await expect(repository.createSupervisor(input)).rejects.toThrow(/no se pudo crear el supervisor/i);
    });
  });
});

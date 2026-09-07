import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ProducerRepository } from '../ProducerRepository';
import { supabase } from '../../services/supabase';

vi.mock('../../services/supabase', () => {
  return {
    supabase: {
      from: vi.fn(),
      auth: {
        getSession: vi.fn(),
      },
    },
  };
});

describe('ProducerRepository', () => {
  let repository: ProducerRepository;

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    repository = new ProducerRepository();
  });

  describe('setAdvisorStatus (design 3.3 — mirrors AuthRepository.resetPasswordFromAdmin)', () => {
    it('sends a PATCH to /api/advisors/:id/status with the session Bearer token and { active } body', async () => {
      vi.mocked(supabase.auth.getSession).mockResolvedValueOnce({
        data: { session: { access_token: 'admin-jwt-1' } },
      } as any);
      const fetchSpy = vi.spyOn(window, 'fetch').mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, id: 'adv-1', status: 'inactive', isActive: false, hasAccount: true }),
      } as Response);

      await repository.setAdvisorStatus('adv-1', false);

      expect(fetchSpy).toHaveBeenCalledWith('/api/advisors/adv-1/status', expect.objectContaining({
        method: 'PATCH',
        headers: expect.objectContaining({
          'Content-Type': 'application/json',
          'Authorization': 'Bearer admin-jwt-1',
        }),
        body: JSON.stringify({ active: false }),
      }));
    });

    it('sends an empty Bearer token (never omits the header) when there is no active session', async () => {
      vi.mocked(supabase.auth.getSession).mockResolvedValueOnce({ data: { session: null } } as any);
      const fetchSpy = vi.spyOn(window, 'fetch').mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true }),
      } as Response);

      await repository.setAdvisorStatus('adv-1', true);

      expect(fetchSpy).toHaveBeenCalledWith('/api/advisors/adv-1/status', expect.objectContaining({
        headers: expect.objectContaining({ 'Authorization': 'Bearer ' }),
      }));
    });

    it('throws the server error message when the request is rejected (e.g. 403 self-deactivation)', async () => {
      vi.mocked(supabase.auth.getSession).mockResolvedValueOnce({
        data: { session: { access_token: 'x' } },
      } as any);
      vi.spyOn(window, 'fetch').mockResolvedValueOnce({
        ok: false,
        json: async () => ({ error: 'Un administrador no puede modificar su propio estado.' }),
      } as Response);

      await expect(repository.setAdvisorStatus('admin-1', false)).rejects.toThrow(
        'Un administrador no puede modificar su propio estado.'
      );
    });

    it('resolves with the parsed response body on success', async () => {
      vi.mocked(supabase.auth.getSession).mockResolvedValueOnce({
        data: { session: { access_token: 'x' } },
      } as any);
      const body = { success: true, id: 'adv-1', status: 'active', isActive: true, hasAccount: true };
      vi.spyOn(window, 'fetch').mockResolvedValueOnce({ ok: true, json: async () => body } as Response);

      const result = await repository.setAdvisorStatus('adv-1', true);

      expect(result).toEqual(body);
    });
  });

  describe('searchAdvisors (design 3.4)', () => {
    it('sends a GET to /api/advisors/search with q and the session Bearer token', async () => {
      vi.mocked(supabase.auth.getSession).mockResolvedValueOnce({
        data: { session: { access_token: 'admin-jwt-2' } },
      } as any);
      const fetchSpy = vi.spyOn(window, 'fetch').mockResolvedValueOnce({
        ok: true,
        json: async () => ({ results: [], total: 0, truncated: false }),
      } as Response);

      await repository.searchAdvisors('gomez');

      expect(fetchSpy).toHaveBeenCalledWith(
        '/api/advisors/search?q=gomez',
        expect.objectContaining({
          method: 'GET',
          headers: expect.objectContaining({ 'Authorization': 'Bearer admin-jwt-2' }),
        })
      );
    });

    it('encodes the query term and appends the status filter when provided', async () => {
      vi.mocked(supabase.auth.getSession).mockResolvedValueOnce({
        data: { session: { access_token: 'x' } },
      } as any);
      const fetchSpy = vi.spyOn(window, 'fetch').mockResolvedValueOnce({
        ok: true,
        json: async () => ({ results: [], total: 0, truncated: false }),
      } as Response);

      await repository.searchAdvisors('maría josé', { status: 'inactive' });

      expect(fetchSpy).toHaveBeenCalledWith(
        `/api/advisors/search?q=${encodeURIComponent('maría josé')}&status=inactive`,
        expect.anything()
      );
    });

    it('omits q entirely when called with an empty term (Esc.15 — full list)', async () => {
      vi.mocked(supabase.auth.getSession).mockResolvedValueOnce({
        data: { session: { access_token: 'x' } },
      } as any);
      const fetchSpy = vi.spyOn(window, 'fetch').mockResolvedValueOnce({
        ok: true,
        json: async () => ({ results: [], total: 0, truncated: false }),
      } as Response);

      await repository.searchAdvisors('');

      expect(fetchSpy).toHaveBeenCalledWith('/api/advisors/search', expect.anything());
    });

    it('maps producer results to the Producer shape (status included)', async () => {
      vi.mocked(supabase.auth.getSession).mockResolvedValueOnce({
        data: { session: { access_token: 'x' } },
      } as any);
      const resultRow = {
        id: 'adv-ana', name: 'Ana Ruiz', firstName: 'Ana', lastName: 'Ruiz', producerCode: 'PROMO_ANA',
        email: 'ana@medinex.com', phone: null, dni: '31000111', status: 'inactive', isActive: false,
        hasAccount: true, commissionRate: 10, totalAffiliatesReferred: 2,
      };
      vi.spyOn(window, 'fetch').mockResolvedValueOnce({
        ok: true,
        json: async () => ({ results: [resultRow], total: 1, truncated: false }),
      } as Response);

      const producers = await repository.searchAdvisors('ana');

      expect(producers).toHaveLength(1);
      expect(producers[0]).toMatchObject({ id: 'adv-ana', status: 'inactive', producerCode: 'PROMO_ANA' });
    });

    it('throws the server error message on a rejected search (e.g. 403 non-admin)', async () => {
      vi.mocked(supabase.auth.getSession).mockResolvedValueOnce({
        data: { session: { access_token: 'x' } },
      } as any);
      vi.spyOn(window, 'fetch').mockResolvedValueOnce({
        ok: false,
        json: async () => ({ error: 'Acceso denegado. Se requieren permisos de administrador.' }),
      } as Response);

      await expect(repository.searchAdvisors('ana')).rejects.toThrow(
        'Acceso denegado. Se requieren permisos de administrador.'
      );
    });
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ProspectRepository } from '../ProspectRepository';
import { supabase } from '../../services/supabase';

vi.mock('../../services/supabase', () => ({
  supabase: { from: vi.fn() },
}));

/** Chainable, awaitable stand-in for a PostgREST query builder. */
function chain(result: { data?: unknown; error?: unknown }) {
  const c: any = {};
  for (const m of ['select', 'order', 'eq', 'insert', 'update', 'delete', 'single']) {
    c[m] = vi.fn(() => c);
  }
  c.then = (resolve: any, reject: any) => Promise.resolve({ data: null, error: null, ...result }).then(resolve, reject);
  return c;
}

const row = {
  id: 'p-1',
  advisor_id: 'adv-1',
  full_name: 'Laura Pérez',
  phone: '3875111222',
  email: 'laura@test.local',
  notes: 'Llamar el lunes',
  status: 'contacted',
  source: 'manual',
  last_contact_at: '2026-11-10T12:00:00Z',
  created_at: '2026-11-01T12:00:00Z',
  updated_at: '2026-11-10T12:00:00Z',
  advisor: { full_name: 'Pedro Gómez' },
};

describe('ProspectRepository', () => {
  let repository: ProspectRepository;

  beforeEach(() => {
    vi.clearAllMocks();
    repository = new ProspectRepository();
  });

  describe('list', () => {
    it('reads prospects newest first and maps them to the domain shape', async () => {
      const q = chain({ data: [row] });
      vi.mocked(supabase.from).mockReturnValueOnce(q);

      const result = await repository.list();

      expect(supabase.from).toHaveBeenCalledWith('prospects');
      expect(q.order).toHaveBeenCalledWith('created_at', { ascending: false });
      expect(q.eq).not.toHaveBeenCalled();
      expect(result).toEqual([{
        id: 'p-1',
        advisorId: 'adv-1',
        advisorName: 'Pedro Gómez',
        fullName: 'Laura Pérez',
        phone: '3875111222',
        email: 'laura@test.local',
        notes: 'Llamar el lunes',
        status: 'contacted',
        source: 'manual',
        lastContactAt: '2026-11-10T12:00:00Z',
        createdAt: '2026-11-01T12:00:00Z',
        updatedAt: '2026-11-10T12:00:00Z',
      }]);
    });

    it('narrows to one advisor when asked', async () => {
      const q = chain({ data: [] });
      vi.mocked(supabase.from).mockReturnValueOnce(q);

      await repository.list({ advisorId: 'adv-1' });

      expect(q.eq).toHaveBeenCalledWith('advisor_id', 'adv-1');
    });

    it('maps null columns to undefined and tolerates a missing advisor', async () => {
      vi.mocked(supabase.from).mockReturnValueOnce(chain({
        data: [{ ...row, phone: null, email: null, notes: null, last_contact_at: null, advisor: null }],
      }));

      const [p] = await repository.list();

      expect(p.phone).toBeUndefined();
      expect(p.email).toBeUndefined();
      expect(p.notes).toBeUndefined();
      expect(p.lastContactAt).toBeUndefined();
      expect(p.advisorName).toBeUndefined();
    });

    it('throws the database error', async () => {
      vi.mocked(supabase.from).mockReturnValueOnce(chain({ error: new Error('denied') }));
      await expect(repository.list()).rejects.toThrow('denied');
    });
  });

  describe('create', () => {
    it('inserts a trimmed prospect for the advisor and returns it mapped', async () => {
      const q = chain({ data: row });
      vi.mocked(supabase.from).mockReturnValueOnce(q);

      const created = await repository.create('adv-1', {
        fullName: '  Laura Pérez ',
        phone: ' 3875111222 ',
        email: '',
        notes: undefined,
      });

      expect(q.insert).toHaveBeenCalledWith({
        advisor_id: 'adv-1',
        full_name: 'Laura Pérez',
        phone: '3875111222',
        email: null,
        notes: null,
      });
      expect(q.single).toHaveBeenCalled();
      expect(created.id).toBe('p-1');
    });

    it('throws the database error', async () => {
      vi.mocked(supabase.from).mockReturnValueOnce(chain({ error: new Error('nope') }));
      await expect(repository.create('adv-1', { fullName: 'X' })).rejects.toThrow('nope');
    });
  });

  describe('update', () => {
    it('writes only the provided fields, snake_cased', async () => {
      const q = chain({ data: row });
      vi.mocked(supabase.from).mockReturnValueOnce(q);

      await repository.update('p-1', { status: 'interested', lastContactAt: '2026-11-11T10:00:00Z', notes: ' hola ' });

      expect(q.update).toHaveBeenCalledWith({
        status: 'interested',
        last_contact_at: '2026-11-11T10:00:00Z',
        notes: 'hola',
      });
      expect(q.eq).toHaveBeenCalledWith('id', 'p-1');
    });

    it('clears an optional field when it is sent empty', async () => {
      const q = chain({ data: row });
      vi.mocked(supabase.from).mockReturnValueOnce(q);

      await repository.update('p-1', { phone: '' });

      expect(q.update).toHaveBeenCalledWith({ phone: null });
    });

    it('throws the database error', async () => {
      vi.mocked(supabase.from).mockReturnValueOnce(chain({ error: new Error('nope') }));
      await expect(repository.update('p-1', { status: 'lost' })).rejects.toThrow('nope');
    });
  });

  describe('remove', () => {
    it('deletes by id', async () => {
      const q = chain({});
      vi.mocked(supabase.from).mockReturnValueOnce(q);

      await repository.remove('p-1');

      expect(q.delete).toHaveBeenCalled();
      expect(q.eq).toHaveBeenCalledWith('id', 'p-1');
    });

    it('throws the database error', async () => {
      vi.mocked(supabase.from).mockReturnValueOnce(chain({ error: new Error('nope') }));
      await expect(repository.remove('p-1')).rejects.toThrow('nope');
    });
  });
});

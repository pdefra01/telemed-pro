import { describe, it, expect, vi } from 'vitest';
import { applyProfileAccess } from '../profileAccess.js';

function createDb({ updateError = null, deleteError = null } = {}) {
  const calls = { update: null, eq: null };
  const deleteUser = vi.fn().mockResolvedValue({ error: deleteError });
  const supabaseAdmin = {
    from: vi.fn((table) => ({
      update: (payload) => {
        calls.table = table;
        calls.update = payload;
        return {
          eq: (col, val) => {
            calls.eq = [col, val];
            return Promise.resolve({ error: updateError });
          },
        };
      },
    })),
    auth: { admin: { deleteUser } },
  };
  return { supabaseAdmin, calls, deleteUser };
}

describe('applyProfileAccess', () => {
  it('sets role and is_active on the new profile with the service role', async () => {
    const { supabaseAdmin, calls, deleteUser } = createDb();
    const result = await applyProfileAccess(supabaseAdmin, 'user-1', { role: 'doctor', isActive: true });
    expect(result).toEqual({ ok: true });
    expect(calls.table).toBe('profiles');
    expect(calls.update).toEqual({ role: 'doctor', is_active: true });
    expect(calls.eq).toEqual(['id', 'user-1']);
    expect(deleteUser).not.toHaveBeenCalled();
  });

  it('deletes the auth user when the profile update fails, so no half-created account remains', async () => {
    const { supabaseAdmin, deleteUser } = createDb({ updateError: { message: 'db down' } });
    const result = await applyProfileAccess(supabaseAdmin, 'user-1', { role: 'admin', isActive: true });
    expect(result).toEqual({ ok: false, error: 'db down' });
    expect(deleteUser).toHaveBeenCalledWith('user-1');
  });

  it('never throws: a rejected update also rolls back and reports the error', async () => {
    const { supabaseAdmin, deleteUser } = createDb();
    supabaseAdmin.from = vi.fn(() => { throw new Error('network'); });
    const result = await applyProfileAccess(supabaseAdmin, 'user-1', { role: 'patient', isActive: true });
    expect(result).toEqual({ ok: false, error: 'network' });
    expect(deleteUser).toHaveBeenCalledWith('user-1');
  });
});

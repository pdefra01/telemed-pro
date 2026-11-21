import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@supabase/supabase-js', () => ({ createClient: vi.fn(() => ({})) }));

import { authStorage, clearStoredAuthSession, relocateAuthSession } from '../services/supabase';

const KEY = 'sb-test-auth-token';
const session = (role?: string) => JSON.stringify({ access_token: 't', user: { id: 'u-1', user_metadata: role ? { role } : { full_name: 'X' }, app_metadata: {} } });
const cacheUser = (role: string, store: Storage = sessionStorage) => store.setItem('medinex_user', JSON.stringify({ id: 'u-1', role }));

describe('auth session storage', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('keeps a supervisor session out of localStorage although the auth metadata has no role (created by the server)', () => {
    cacheUser('supervisor');

    authStorage.setItem(KEY, session());

    expect(sessionStorage.getItem(KEY)).not.toBeNull();
    expect(localStorage.getItem(KEY)).toBeNull();
  });

  it('moves a session already persisted at sign-in once the app knows the user is a supervisor', () => {
    authStorage.setItem(KEY, session());          // sign-in: the role is not known yet
    expect(localStorage.getItem(KEY)).not.toBeNull();

    cacheUser('supervisor');
    relocateAuthSession();

    expect(localStorage.getItem(KEY)).toBeNull();
    expect(sessionStorage.getItem(KEY)).toBe(session());
  });

  it('keeps patients persistent, with or without a role in the metadata', () => {
    authStorage.setItem(KEY, session('patient'));
    expect(localStorage.getItem(KEY)).not.toBeNull();

    localStorage.clear();
    cacheUser('patient', localStorage);
    authStorage.setItem(KEY, session());
    relocateAuthSession();
    expect(localStorage.getItem(KEY)).not.toBeNull();
    expect(sessionStorage.getItem(KEY)).toBeNull();
  });

  it('still honours the role in the auth metadata (an advisor is not persistent)', () => {
    authStorage.setItem(KEY, session('advisor'));
    expect(sessionStorage.getItem(KEY)).not.toBeNull();
    expect(localStorage.getItem(KEY)).toBeNull();
  });

  it('clears the stored auth session from both storages without touching other keys', () => {
    localStorage.setItem(KEY, session('patient'));
    sessionStorage.setItem('sb-other-auth-token', session('advisor'));
    localStorage.setItem(`${KEY}-code-verifier`, 'verifier');
    localStorage.setItem('medinex_session_policy', '{}');

    clearStoredAuthSession();

    expect(localStorage.getItem(KEY)).toBeNull();
    expect(sessionStorage.getItem('sb-other-auth-token')).toBeNull();
    expect(localStorage.getItem(`${KEY}-code-verifier`)).toBeNull();
    expect(localStorage.getItem('medinex_session_policy')).toBe('{}');
  });
});

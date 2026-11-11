import { createClient } from '@supabase/supabase-js';
import { DEFAULT_SESSION_POLICY, resolvePersistentSession } from '../utils/sessionExpiry';

export const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
export const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('Faltan las variables de entorno de Supabase. Verificá tu archivo .env.local');
}

const DEFAULT_POLICY = DEFAULT_SESSION_POLICY;

const getPolicy = () => {
  try {
    const cached = localStorage.getItem('medinex_session_policy') || sessionStorage.getItem('medinex_session_policy');
    if (cached) return JSON.parse(cached);
  } catch (e) {
    console.error("Error reading session policy cache:", e);
  }
  return DEFAULT_POLICY;
};

// Users created by the server (e.g. supervisors) carry their role only in
// `profiles`, not in the auth metadata: fall back to the user the app cached.
const cachedUserRole = (): string | undefined => {
  try {
    const cached = sessionStorage.getItem('medinex_user') || localStorage.getItem('medinex_user');
    return cached ? JSON.parse(cached)?.role : undefined;
  } catch {
    return undefined;
  }
};

const isAuthSessionKey = (key: string) => /^sb-.*-auth-token$/.test(key);

export const authStorage = {
  getItem: (key: string): string | null => {
    return sessionStorage.getItem(key) || localStorage.getItem(key);
  },
  setItem: (key: string, value: string): void => {
    try {
      const data = JSON.parse(value);
      const role = data?.user?.user_metadata?.role || data?.user?.app_metadata?.role || cachedUserRole();
      const policy = getPolicy();
      // A role missing from the cached policy uses its default (supervisors are not persistent).
      if (resolvePersistentSession(policy, role)) {
        localStorage.setItem(key, value);
        sessionStorage.removeItem(key);
      } else {
        sessionStorage.setItem(key, value);
        localStorage.removeItem(key);
      }
    } catch (e) {
      localStorage.setItem(key, value);
    }
  },
  removeItem: (key: string): void => {
    sessionStorage.removeItem(key);
    localStorage.removeItem(key);
  }
};

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: authStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
  }
});

/**
 * Re-applies the persistence rule to the stored auth session. The session is
 * written at sign-in, before the app knows the user's role; App calls this once
 * the user (or a newer policy) is known, so a non-persistent role never keeps
 * its session in localStorage.
 */
export const relocateAuthSession = (): void => {
  const keys = new Set<string>();
  [localStorage, sessionStorage].forEach((store) => {
    for (let i = 0; i < store.length; i += 1) {
      const key = store.key(i);
      if (key && isAuthSessionKey(key)) keys.add(key);
    }
  });
  keys.forEach((key) => {
    const value = authStorage.getItem(key);
    if (value) authStorage.setItem(key, value);
  });
};

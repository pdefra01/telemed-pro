import { createClient } from '@supabase/supabase-js';

export const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
export const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('Faltan las variables de entorno de Supabase. Verificá tu archivo .env.local');
}

const DEFAULT_POLICY = {
  admin: { timeoutMinutes: 15, persistent: false },
  doctor: { timeoutMinutes: 30, persistent: false },
  advisor: { timeoutMinutes: 30, persistent: false },
  patient: { timeoutMinutes: 0, persistent: true }
};

const getPolicy = () => {
  try {
    const cached = localStorage.getItem('medinex_session_policy') || sessionStorage.getItem('medinex_session_policy');
    if (cached) return JSON.parse(cached);
  } catch (e) {
    console.error("Error reading session policy cache:", e);
  }
  return DEFAULT_POLICY;
};

const customStorage = {
  getItem: (key: string): string | null => {
    return sessionStorage.getItem(key) || localStorage.getItem(key);
  },
  setItem: (key: string, value: string): void => {
    try {
      const data = JSON.parse(value);
      const role = data?.user?.user_metadata?.role || data?.user?.app_metadata?.role;
      const policy = getPolicy();
      const rolePolicy = policy[role] || { persistent: true };
      
      if (rolePolicy.persistent) {
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
    storage: customStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
  }
});

// Resolves the LOCAL Supabase/LiveKit environment for the demo recorder and
// refuses to continue if anything points outside this machine.
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const LOCAL_HOSTS = new Set(['127.0.0.1', 'localhost', '::1', '[::1]']);

export function isLocalUrl(value) {
  try {
    const { hostname } = new URL(value);
    return LOCAL_HOSTS.has(hostname);
  } catch {
    return false;
  }
}

export function assertLocalUrl(name, value) {
  if (!isLocalUrl(value)) {
    throw new Error(
      `[demo] Refusing to run: ${name} (${value || '<empty>'}) is not a local URL. ` +
        'The demo recorder only works against a local Supabase/LiveKit stack.'
    );
  }
}

/** Same guard for a postgres connection string (postgres:// or postgresql://). */
export function assertLocalDbUrl(name, value) {
  const asHttp = typeof value === 'string' ? value.replace(/^postgres(ql)?:/, 'http:') : value;
  if (typeof value !== 'string' || !/^postgres(ql)?:/.test(value) || !isLocalUrl(asHttp)) {
    throw new Error(
      `[demo] Refusing to run: ${name} is not a local postgres URL. ` +
        'The demo recorder only works against a local Supabase/LiveKit stack.'
    );
  }
}

// The local edge runtime reaches the API gateway as http://kong:8000, so the
// signed URLs it stores (e.g. prescriptions.pdf_url) carry that host, which
// only resolves inside Docker.
const EDGE_RUNTIME_ORIGIN = 'http://kong:8000';

/**
 * Rewrites a storage URL signed by the local edge runtime so a browser on
 * this machine can open it. The signature covers the path, not the host.
 * Refuses anything that is not the internal gateway or already local.
 */
export function toLocalStorageUrl(signedUrl, apiUrl) {
  assertLocalUrl('Supabase API URL', apiUrl);
  let url;
  try {
    url = new URL(signedUrl);
  } catch {
    throw new Error(`[demo] Refusing to run: ${signedUrl || '<empty>'} is not a URL.`);
  }
  if (isLocalUrl(signedUrl)) return signedUrl;
  if (url.origin !== EDGE_RUNTIME_ORIGIN) assertLocalUrl('storage URL', signedUrl);
  const api = new URL(apiUrl);
  url.protocol = api.protocol;
  url.host = api.host;
  return url.toString();
}

/** Reads `supabase status -o env` for the LOCAL stack (never the linked project). */
export function readLocalSupabaseStatus(cwd) {
  let raw;
  try {
    raw = execSync('supabase status -o env', { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (err) {
    throw new Error('[demo] Local Supabase is not running. Start it with `supabase start`.\n' + (err.stderr || err.message));
  }
  const vars = {};
  for (const line of raw.split(/\r?\n/)) {
    const m = line.match(/^([A-Z_]+)="?(.*?)"?$/);
    if (m) vars[m[1]] = m[2];
  }
  const status = {
    apiUrl: vars.API_URL,
    dbUrl: vars.DB_URL,
    anonKey: vars.ANON_KEY,
    serviceRoleKey: vars.SERVICE_ROLE_KEY,
  };
  for (const [key, value] of Object.entries(status)) {
    if (!value) throw new Error(`[demo] Could not read ${key} from \`supabase status -o env\`.`);
  }
  assertLocalUrl('Supabase API URL', status.apiUrl);
  assertLocalDbUrl('Supabase DB URL', status.dbUrl);
  return status;
}

export const LIVEKIT = {
  url: 'ws://127.0.0.1:7880',
  apiKey: 'devkey',
  apiSecret: 'secret',
};

/**
 * Builds the full, explicit environment for the app processes (vite + server.js).
 * Every external integration is pointed at a closed local port so nothing
 * leaves the machine even if a code path tries to call it.
 */
export function buildAppEnv(status) {
  assertLocalUrl('VITE_SUPABASE_URL', status.apiUrl);
  assertLocalUrl('VITE_LIVEKIT_URL', LIVEKIT.url);
  assertLocalDbUrl('DATABASE_URL', status.dbUrl);
  const DEAD = 'http://127.0.0.1:9';
  return {
    ...process.env,
    // server.js only loads .env.local when NODE_ENV !== 'production'.
    NODE_ENV: 'production',
    PORT: '3001',
    VITE_SUPABASE_URL: status.apiUrl,
    VITE_SUPABASE_ANON_KEY: status.anonKey,
    VITE_LIVEKIT_URL: LIVEKIT.url,
    VITE_EMAIL_VERIFICATION_REQUIRED: 'false',
    SUPABASE_URL: status.apiUrl,
    SUPABASE_SERVICE_ROLE_KEY: status.serviceRoleKey,
    LIVEKIT_API_KEY: LIVEKIT.apiKey,
    LIVEKIT_API_SECRET: LIVEKIT.apiSecret,
    PUBLIC_APP_URL: 'http://127.0.0.1:3000',
    EMAIL_VERIFICATION_REQUIRED: 'false',
    GEMINI_API_KEY: 'demo-disabled',
    WHATSAPP_GATEWAY_URL: DEAD,
    WHATSAPP_GATEWAY_API_KEY: 'demo-disabled',
    WHATSAPP_GATEWAY_SESSION: 'demo-disabled',
    MERCADOPAGO_ACCESS_TOKEN: 'demo-disabled',
    MERCADOPAGO_WEBHOOK_SECRET: 'demo-disabled',
    SMTP_HOST: '127.0.0.1',
    SMTP_PORT: '9',
    SMTP_USER: 'demo-disabled',
    SMTP_PASS: 'demo-disabled',
    SMTP_FROM: 'demo@localhost',
    SMTP_SECURE: 'false',
    DATABASE_URL: status.dbUrl,
  };
}

/** True when the given module URL is the script node was started with. */
export function isMainModule(moduleUrl) {
  if (!process.argv[1]) return false;
  const norm = (p) => p.replaceAll('\\', '/').toLowerCase();
  return norm(fileURLToPath(moduleUrl)) === norm(resolve(process.argv[1]));
}

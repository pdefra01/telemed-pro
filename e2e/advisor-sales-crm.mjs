/**
 * E2E: an advisor works a prospect in the CRM until it becomes a sale.
 *
 * Flow:
 *   1. Seed an advisor (auth user + profile + producers row) and an admin.
 *   2. Advisor logs in (UI) and creates a prospect in "Prospectos".
 *   3. Advisor moves it to "Contactado" and registers a contact.
 *   4. The client submits an adhesion with the advisor's promoter code
 *      (inserted with the service role: the public form needs OTP, Storage
 *      and MercadoPago, which are out of scope here).
 *   5. Prospect intake sync runs -> the prospect becomes "Interesado".
 *   6. Admin approves the adhesion through POST /api/approve-adhesion.
 *   7. Prospect intake sync runs -> the prospect becomes "Afiliado" and the
 *      monthly progress shows the sale as approved, pending payment.
 *
 * Runs ONLY against the local Supabase stack (refuses any non-local URL).
 * Starts its own `server.js` (port 3001, the Vite proxy target) and Vite
 * (port 3100), and stops them at the end.
 *
 * Usage:
 *   supabase start            # local stack must be up
 *   npm run e2e:advisor-sales
 *
 * Optional env: E2E_SUPABASE_URL, E2E_SUPABASE_ANON_KEY,
 * E2E_SUPABASE_SERVICE_ROLE_KEY, E2E_DB_URL (default: `supabase status -o env`),
 * E2E_HEADED=1 to watch the browser.
 */

import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import { spawn, execSync } from 'child_process';
import { mkdir } from 'fs/promises';
import net from 'net';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const SCREENSHOTS_DIR = path.join(__dirname, 'screenshots', 'advisor-sales-crm');
const API_PORT = 3001; // fixed: vite.config.ts proxies /api to localhost:3001
const WEB_PORT = 3100;
const BASE_URL = `http://localhost:${WEB_PORT}`;
const API_URL = `http://localhost:${API_PORT}`;

const RUN = `${Date.now()}`.slice(-6);
const rand = (n) => Array.from({ length: n }, () => Math.floor(Math.random() * 10)).join('');

const ADVISOR = {
  email: `e2e-advisor-${RUN}@test.local`,
  password: 'Asesor123!',
  firstName: 'Ana',
  lastName: `Asesora ${RUN}`,
  code: `E2E${RUN}`,
};
const ADMIN = { email: `e2e-admin-${RUN}@test.local`, password: 'Admin123!' };
const PHONE = `11${rand(8)}`; // 10 digits, what intake matches on
const PROSPECT = {
  name: `Carlos Prospecto ${RUN}`,
  phone: `${PHONE.slice(0, 2)} ${PHONE.slice(2, 6)}-${PHONE.slice(6)}`,
  email: `e2e-client-${RUN}@test.local`,
  notes: 'Pidió info del plan familiar por WhatsApp',
};

let shot = 1;
const children = [];

const step = (msg) => console.log(`\n🔷 ${msg}`);
const ok = (msg) => console.log(`  ✅ ${msg}`);

function assert(cond, msg) {
  if (!cond) throw new Error(`Assertion failed: ${msg}`);
  ok(msg);
}

async function screenshot(page, name) {
  const file = path.join(SCREENSHOTS_DIR, `${String(shot++).padStart(2, '0')}_${name}.png`);
  await page.screenshot({ path: file, fullPage: true });
  console.log(`  📸 ${path.relative(ROOT, file)}`);
}

// ─── Environment ──────────────────────────────────────────────────────────────

function localSupabaseEnv() {
  let status = {};
  if (!process.env.E2E_SUPABASE_URL || !process.env.E2E_SUPABASE_SERVICE_ROLE_KEY) {
    const out = execSync('supabase status -o env', { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    for (const line of out.split(/\r?\n/)) {
      const m = line.match(/^([A-Z_]+)="?([^"]*)"?$/);
      if (m) status[m[1]] = m[2];
    }
  }
  const env = {
    url: process.env.E2E_SUPABASE_URL || status.API_URL,
    anonKey: process.env.E2E_SUPABASE_ANON_KEY || status.ANON_KEY || status.PUBLISHABLE_KEY,
    serviceKey: process.env.E2E_SUPABASE_SERVICE_ROLE_KEY || status.SERVICE_ROLE_KEY || status.SECRET_KEY,
    dbUrl: process.env.E2E_DB_URL || status.DB_URL,
  };
  if (!env.url || !env.anonKey || !env.serviceKey) {
    throw new Error('Local Supabase keys not found. Run `supabase start` first.');
  }
  const host = new URL(env.url).hostname;
  if (!['localhost', '127.0.0.1'].includes(host)) {
    throw new Error(`Refusing to run against a non-local Supabase (${host}).`);
  }
  return env;
}

function portInUse(port) {
  return new Promise((resolve) => {
    const socket = net.connect(port, '127.0.0.1');
    socket.once('connect', () => { socket.destroy(); resolve(true); });
    socket.once('error', () => resolve(false));
  });
}

async function waitForHttp(url, label, timeoutMs = 60000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      await fetch(url);
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 500));
    }
  }
  throw new Error(`${label} did not start on ${url}`);
}

function start(label, args, env) {
  const child = spawn(process.execPath, args, { cwd: ROOT, env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
  const log = [];
  const keep = (chunk) => { log.push(chunk.toString()); if (log.length > 200) log.shift(); };
  child.stdout.on('data', keep);
  child.stderr.on('data', keep);
  child.label = label;
  child.log = log;
  children.push(child);
  return child;
}

async function startApp(env) {
  step('PHASE 0 — Start server.js and Vite against the local stack');
  for (const port of [API_PORT, WEB_PORT]) {
    if (await portInUse(port)) throw new Error(`Port ${port} is busy. Stop the dev server first.`);
  }
  start('server.js', ['server.js'], {
    NODE_ENV: 'development',
    PORT: String(API_PORT),
    SUPABASE_URL: env.url,
    SUPABASE_SERVICE_ROLE_KEY: env.serviceKey,
    ...(env.dbUrl ? { DATABASE_URL: env.dbUrl } : {}),
    EMAIL_VERIFICATION_REQUIRED: 'false',
    // Defined-but-empty wins over .env.local (dotenv never overrides): MercadoPago off.
    MERCADOPAGO_ACCESS_TOKEN: '',
    MERCADOPAGO_WEBHOOK_SECRET: '',
  });
  start('vite', ['node_modules/vite/bin/vite.js', '--port', String(WEB_PORT), '--strictPort'], {
    VITE_SUPABASE_URL: env.url,
    VITE_SUPABASE_ANON_KEY: env.anonKey,
    VITE_EMAIL_VERIFICATION_REQUIRED: 'false',
  });
  await waitForHttp(`${API_URL}/`, 'server.js');
  await waitForHttp(`${BASE_URL}/`, 'Vite');
  ok(`server.js on ${API_PORT}, Vite on ${WEB_PORT}`);
}

// ─── Seed ─────────────────────────────────────────────────────────────────────

async function seed(admin) {
  step('PHASE 1 — Seed an advisor and an admin (service role)');

  const { data: advisorAuth, error: advisorError } = await admin.auth.admin.createUser({
    email: ADVISOR.email,
    password: ADVISOR.password,
    email_confirm: true,
    user_metadata: { role: 'advisor', full_name: `${ADVISOR.firstName} ${ADVISOR.lastName}` },
  });
  if (advisorError) throw advisorError;
  const advisorId = advisorAuth.user.id;

  const { error: profileError } = await admin.from('profiles').update({
    role: 'advisor',
    promoter_code: ADVISOR.code,
    first_name: ADVISOR.firstName,
    last_name: ADVISOR.lastName,
    dni: `9${rand(7)}`,
    phone: `11${rand(8)}`,
    is_active: true,
  }).eq('id', advisorId);
  if (profileError) throw profileError;

  const { error: producerError } = await admin.from('producers').insert({
    id: advisorId,
    name: `${ADVISOR.firstName} ${ADVISOR.lastName}`,
    producer_code: ADVISOR.code,
    email: ADVISOR.email,
    commission_rate: 10,
    status: 'active',
    links_shared_count: 0,
  });
  if (producerError) throw producerError;
  ok(`Advisor ${ADVISOR.email} with promoter code ${ADVISOR.code}`);

  const { data: adminAuth, error: adminError } = await admin.auth.admin.createUser({
    email: ADMIN.email,
    password: ADMIN.password,
    email_confirm: true,
    user_metadata: { role: 'admin', full_name: 'Admin E2E' },
  });
  if (adminError) throw adminError;
  const { error: adminProfileError } = await admin.from('profiles')
    .update({ role: 'admin', is_active: true }).eq('id', adminAuth.user.id);
  if (adminProfileError) throw adminProfileError;
  ok(`Admin ${ADMIN.email}`);

  return { advisorId };
}

// ─── Advisor UI ───────────────────────────────────────────────────────────────

async function loginAdvisor(page) {
  step('PHASE 2 — Advisor logs in');
  await page.goto(`${BASE_URL}/#/login`);
  await page.getByRole('button', { name: 'Asesores' }).click();
  await page.locator('#auth-identifier').fill(ADVISOR.email);
  await page.locator('#auth-password').fill(ADVISOR.password);
  await page.getByRole('button', { name: /ingresar/i }).click();
  await page.getByText(`Código Promotor: ${ADVISOR.code}`, { exact: false }).waitFor({ timeout: 20000 });
  await screenshot(page, 'advisor_dashboard');
  ok('Advisor dashboard shows the promoter code');
}

function prospectRow(page) {
  return page.locator('li[data-testid^="prospect-"]').filter({ hasText: PROSPECT.name });
}

async function summaryCount(page, status) {
  const text = await page.getByTestId(`summary-${status}`).locator('strong').textContent();
  return Number(text);
}

async function waitForStatus(page, status, timeoutMs = 10000) {
  const select = prospectRow(page).getByLabel('Estado');
  const deadline = Date.now() + timeoutMs;
  let value;
  while (Date.now() < deadline) {
    value = await select.inputValue().catch(() => undefined);
    if (value === status) return;
    await page.waitForTimeout(250);
  }
  throw new Error(`Prospect status is "${value}", expected "${status}"`);
}

async function openProspects(page) {
  // A goto to the same hash URL does not reload the SPA: force a full reload
  // so the page refetches from the database.
  await page.goto(`${BASE_URL}/#/prospects`);
  await page.reload();
  await page.getByRole('heading', { name: 'Mis prospectos' }).waitFor({ timeout: 15000 });
}

async function createProspect(page) {
  step('PHASE 3 — Advisor creates a prospect in the CRM');
  await openProspects(page);
  assert(await summaryCount(page, 'new') === 0, 'CRM starts with 0 "Nuevo"');

  await page.getByRole('button', { name: /nuevo prospecto/i }).click();
  await page.locator('#prospect-name').fill(PROSPECT.name);
  await page.locator('#prospect-phone').fill(PROSPECT.phone);
  await page.locator('#prospect-email').fill(PROSPECT.email);
  await page.locator('#prospect-notes').fill(PROSPECT.notes);
  await screenshot(page, 'prospect_form');
  await page.getByRole('button', { name: /guardar prospecto/i }).click();

  await prospectRow(page).waitFor({ timeout: 10000 });
  await waitForStatus(page, 'new');
  assert(await summaryCount(page, 'new') === 1, 'Prospect listed as "Nuevo" (counter = 1)');
  assert(await prospectRow(page).getByText('Sin contacto').isVisible(), 'Row shows "Sin contacto"');
  await screenshot(page, 'prospect_created');
}

async function workProspect(page) {
  step('PHASE 4 — Advisor contacts the prospect');
  await prospectRow(page).getByLabel('Estado').selectOption('contacted');
  await waitForStatus(page, 'contacted');
  await page.getByTestId('summary-contacted').getByText('1').waitFor();
  ok('Status changed to "Contactado"');

  await prospectRow(page).getByRole('button', { name: /detalle/i }).click();
  await prospectRow(page).getByText(PROSPECT.notes).waitFor();
  await prospectRow(page).getByRole('button', { name: /registrar contacto/i }).click();
  await prospectRow(page).getByText(/Últ\. contacto \d{2}\/\d{2}\/\d{4}/).waitFor({ timeout: 10000 });
  ok('Contact registered ("Últ. contacto" shown)');

  // Persisted, not just local state.
  await openProspects(page);
  await waitForStatus(page, 'contacted');
  ok('Status survives a reload');
  await screenshot(page, 'prospect_contacted');
}

// ─── Sale ─────────────────────────────────────────────────────────────────────

async function submitAdhesion(admin) {
  step('PHASE 5 — Client submits the adhesion with the advisor code');
  const { data, error } = await admin.from('adhesion_requests').insert({
    titular_name: PROSPECT.name,
    titular_first_name: 'Carlos',
    titular_last_name: `Prospecto ${RUN}`,
    titular_dni: `3${rand(7)}`,
    titular_cuil: `20${rand(8)}1`,
    titular_birth_date: '1985-04-12',
    titular_address: 'Av. Siempre Viva 742',
    titular_locality: 'CABA',
    titular_neighborhood: 'Palermo',
    titular_civil_status: 'Casado',
    // Same person, formatted differently: intake matches on the last 10 digits.
    titular_phone: `+54 9 ${PHONE}`,
    titular_email: PROSPECT.email.toUpperCase(),
    signature_base64: 'e2e-signature',
    plan_type: 'individual',
    payment_method: 'mercadopago',
    promoter_id: ADVISOR.code,
    status: 'pending',
    email_verified: true,
  }).select('id').single();
  if (error) throw error;
  ok(`Adhesion request ${data.id} (pending)`);
  return data.id;
}

async function syncIntake(admin) {
  const { data, error } = await admin.rpc('sync_prospects_intake');
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  return {
    interested: Number(row.prospects_interested),
    converted: Number(row.prospects_converted),
  };
}

async function approveAdhesion(adhesionId, env) {
  step('PHASE 7 — Admin approves the adhesion (POST /api/approve-adhesion)');
  const client = createClient(env.url, env.anonKey, { auth: { persistSession: false } });
  const { data, error } = await client.auth.signInWithPassword({ email: ADMIN.email, password: ADMIN.password });
  if (error) throw error;

  const res = await fetch(`${API_URL}/api/approve-adhesion`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${data.session.access_token}` },
    body: JSON.stringify({ adhesionId }),
  });
  const body = await res.json().catch(() => ({}));
  assert(res.status === 200, `Approval returns 200 (got ${res.status} ${JSON.stringify(body)})`);
}

async function main() {
  await mkdir(SCREENSHOTS_DIR, { recursive: true });
  const env = localSupabaseEnv();
  const admin = createClient(env.url, env.serviceKey, { auth: { persistSession: false } });

  await startApp(env);
  const { advisorId } = await seed(admin);

  const browser = await chromium.launch({ headless: !process.env.E2E_HEADED });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  page.on('dialog', (d) => d.accept());

  try {
    await loginAdvisor(page);
    await createProspect(page);
    await workProspect(page);

    const adhesionId = await submitAdhesion(admin);

    step('PHASE 6 — Intake sync moves the prospect to "Interesado"');
    const first = await syncIntake(admin);
    assert(first.interested === 1, `Sync advanced 1 prospect to interested (got ${first.interested})`);
    await openProspects(page);
    await waitForStatus(page, 'interested');
    ok('Advisor sees "Interesado" without touching it');
    await screenshot(page, 'prospect_interested');

    await approveAdhesion(adhesionId, env);
    const { data: request } = await admin.from('adhesion_requests')
      .select('status, approved_profile_id').eq('id', adhesionId).single();
    assert(request.status === 'approved' && request.approved_profile_id, 'Adhesion is approved with a profile');
    const { data: affiliate } = await admin.from('profiles')
      .select('role, producer_id').eq('id', request.approved_profile_id).single();
    assert(affiliate.role === 'patient', 'New affiliate has role patient');
    assert(affiliate.producer_id === advisorId, 'New affiliate is attributed to the advisor (producer_id)');

    step('PHASE 8 — Intake sync converts the prospect into a sale');
    const second = await syncIntake(admin);
    assert(second.converted === 1, `Sync converted 1 prospect (got ${second.converted})`);
    const { data: prospect } = await admin.from('prospects')
      .select('status, converted_profile_id').eq('advisor_id', advisorId).eq('full_name', PROSPECT.name).single();
    assert(prospect.converted_profile_id === request.approved_profile_id, 'Prospect linked to the new affiliate');

    await openProspects(page);
    await waitForStatus(page, 'affiliated');
    assert(await summaryCount(page, 'affiliated') === 1, 'Counter "Afiliado" = 1');
    assert(await summaryCount(page, 'interested') === 0, 'Counter "Interesado" back to 0');
    await page.getByTestId('funnel-affiliated').getByText('1').waitFor({ timeout: 10000 });
    ok('Monthly progress: 1 affiliated prospect in the funnel');
    await page.getByTestId('unconfirmed-sales').getByText('1').waitFor({ timeout: 10000 });
    ok('Monthly progress: 1 approved sale pending payment');
    const sold = await page.getByTestId('goal-affiliates').textContent();
    assert(/^\D*0\D/.test(sold ?? ''), `Goal "Afiliados" still 0 until the first payment (${sold?.trim()})`);
    await screenshot(page, 'prospect_affiliated');

    console.log('\n🎉 Advisor CRM sales flow passed.');
  } catch (err) {
    await screenshot(page, 'error').catch(() => {});
    throw err;
  } finally {
    await browser.close();
  }
}

main()
  .catch((err) => {
    console.error(`\n❌ ${err.message}`);
    for (const child of children) {
      console.error(`\n--- last ${child.label} output ---\n${child.log.slice(-30).join('')}`);
    }
    process.exitCode = 1;
  })
  .finally(() => {
    for (const child of children) child.kill();
  });

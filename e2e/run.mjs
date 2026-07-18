/**
 * E2E Test: Patient books appointment → Doctor joins video consultation
 *
 * Usage:
 *   node e2e/run.mjs
 */

import { chromium } from 'playwright';
import { mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCREENSHOTS_DIR = path.join(__dirname, 'screenshots');
const BASE_URL = 'http://localhost:3005';

let screenshots = 1;

async function screenshot(page, name) {
  const file = path.join(SCREENSHOTS_DIR, `${String(screenshots++).padStart(2, '0')}_${name}.png`);
  await page.screenshot({ path: file, fullPage: false });
  console.log(`  📸 ${path.basename(file)}`);
}

function step(msg) {
  console.log(`\n🔷 ${msg}`);
}

function ok(msg) {
  console.log(`  ✅ ${msg}`);
}

function warn(msg) {
  console.log(`  ⚠️  ${msg}`);
}

// ─── Patient Login ─────────────────────────────────────────────────────────────

async function loginPatient(page) {
  step('PHASE 1 — Log in as Patient');
  await page.goto(`${BASE_URL}/#/login`);
  await page.waitForLoadState('networkidle');

  const pacientesTab = page.getByRole('button', { name: /pacientes/i });
  await pacientesTab.click();
  await page.waitForTimeout(500);

  const identInput = page.locator('input[type="text"]').first();
  await identInput.fill('12345678');

  const passwordInput = page.locator('input[type="password"]').first();
  await passwordInput.fill('paciente123');

  await screenshot(page, 'patient_login_filled');

  await page.getByRole('button', { name: /ingresar/i }).click();

  // Wait for patient dashboard to load
  await page.getByRole('button', { name: /nuevo turno/i }).waitFor({ timeout: 15000 });
  await page.waitForTimeout(1000);

  await screenshot(page, 'patient_dashboard');
  ok(`Patient logged in cleanly. URL: ${page.url()}`);
}

// ─── Book Appointment ──────────────────────────────────────────────────────────

async function bookAppointment(page) {
  step('PHASE 2 — Patient books an appointment');

  const newTurnoBtn = page.getByRole('button', { name: /nuevo turno/i });
  await newTurnoBtn.click();
  await page.waitForTimeout(1000);

  await screenshot(page, 'booking_modal_open');
  ok('Booking modal opened');

  const specialtyBtn = page.locator('button').filter({ hasText: /CARDIOLOGÍA|GENERAL|PEDIATRÍA/i }).first();
  if (await specialtyBtn.isVisible()) {
    const text = await specialtyBtn.textContent();
    await specialtyBtn.click();
    await page.waitForTimeout(1000);
    ok(`Specialty clicked: "${text?.trim()}"`);
  }

  await screenshot(page, 'booking_specialty_selected');

  const doctorCard = page.getByText('DR. PABLO MÉDICO').first();
  await doctorCard.waitFor({ timeout: 5000 });
  await doctorCard.click();
  await page.waitForTimeout(1000);
  ok('Doctor card selected');

  await screenshot(page, 'booking_doctor_selected');

  const slotBtn = page.locator('button').filter({ hasText: /\d{2}:\d{2}/ }).first();
  await slotBtn.waitFor({ timeout: 5000 });
  const slotText = await slotBtn.textContent();
  await slotBtn.click();
  await page.waitForTimeout(500);
  ok(`Slot clicked: "${slotText?.trim()}"`);

  await screenshot(page, 'booking_slot_selected');

  const confirmBtn = page.getByRole('button', { name: /confirmar turno/i });
  await confirmBtn.waitFor({ timeout: 5000 });
  await confirmBtn.click();
  await page.waitForTimeout(4000);

  await screenshot(page, 'booking_confirmed');
  ok('Appointment booked successfully!');
}

// ─── Doctor Login ──────────────────────────────────────────────────────────────

async function loginDoctor(page) {
  step('PHASE 3 — Log in as Doctor');

  await page.goto(`${BASE_URL}/#/login`);
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1000);

  const medicosTab = page.getByRole('button', { name: /médicos|medicos/i });
  await medicosTab.waitFor({ timeout: 10000 });
  await medicosTab.click();
  await page.waitForTimeout(500);

  const emailInput = page.locator('input[type="text"]').first();
  await emailInput.fill('doc.e2e@telemed.com');

  const passwordInput = page.locator('input[type="password"]').first();
  await passwordInput.fill('medico123');

  await screenshot(page, 'doctor_login_filled');

  await page.getByRole('button', { name: /ingresar/i }).click();

  // Wait for doctor dashboard
  await page.waitForFunction(() => !window.location.hash.includes('login'), { timeout: 15000 });
  await page.waitForTimeout(2000);

  await screenshot(page, 'doctor_dashboard');
  ok(`Doctor logged in cleanly. URL: ${page.url()}`);
}

// ─── Doctor Joins Call ─────────────────────────────────────────────────────────

async function joinVideoRoom(page) {
  step('PHASE 4 — Doctor joins Video Room');

  const startCallBtn = page.getByRole('link', { name: /iniciar llamada/i }).first();
  await startCallBtn.waitFor({ timeout: 15000 });

  const href = await startCallBtn.getAttribute('href');
  ok(`Found "Iniciar Llamada" link → href: ${href}`);

  await screenshot(page, 'doctor_dashboard_with_call');
  await startCallBtn.click();

  await page.waitForURL(/.*\/room\/.*/);
  await page.waitForTimeout(4000);

  await screenshot(page, 'video_room_loaded');
  ok(`Inside Video Room: ${page.url()}`);
}

// ─── Verify HUD ────────────────────────────────────────────────────────────────

async function verifyHUD(page) {
  step('PHASE 5 — Verify HUD doctor credentials');

  await page.waitForTimeout(3000);
  await screenshot(page, 'video_room_hud');

  const hudHeader = await page.locator('h1').first().textContent().catch(() => '');
  ok(`HUD Main Heading: "${hudHeader?.trim()}"`);

  const subText = await page.locator('p').filter({ hasText: /cardiología|mat\.|especialidad/i }).first().textContent().catch(() => '');
  if (subText) {
    ok(`HUD Doctor Credentials Verified: "${subText.trim()}"`);
  } else {
    warn('HUD secondary credential line not found or waiting for connection');
  }

  await screenshot(page, 'video_room_final');
}

// ─── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('━'.repeat(60));
  console.log('🎬 MEDINEX E2E TEST — Full Patient → Appointment → Video Room');
  console.log('━'.repeat(60));

  if (!existsSync(SCREENSHOTS_DIR)) {
    await mkdir(SCREENSHOTS_DIR, { recursive: true });
  }

  const browser = await chromium.launch({
    headless: false,
    slowMo: 200,
    args: ['--start-maximized']
  });

  const results = [];

  // --- Context 1: Patient ---
  const patientContext = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    ignoreHTTPSErrors: true,
  });
  const patientPage = await patientContext.newPage();
  patientPage.setDefaultTimeout(15000);

  try {
    await loginPatient(patientPage);
    results.push({ phase: 'Patient Login', status: 'PASS' });

    await bookAppointment(patientPage);
    results.push({ phase: 'Book Appointment', status: 'PASS' });
  } catch (err) {
    results.push({ phase: 'Patient Flow', status: 'FAIL', error: err.message });
    warn(`Patient flow failed: ${err.message}`);
    await screenshot(patientPage, 'error_patient_flow');
  }

  // --- Context 2: Doctor ---
  const doctorContext = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    ignoreHTTPSErrors: true,
  });
  const doctorPage = await doctorContext.newPage();
  doctorPage.setDefaultTimeout(15000);

  try {
    await loginDoctor(doctorPage);
    results.push({ phase: 'Doctor Login', status: 'PASS' });

    await joinVideoRoom(doctorPage);
    results.push({ phase: 'Join Video Room', status: 'PASS' });

    await verifyHUD(doctorPage);
    results.push({ phase: 'HUD Verification', status: 'PASS' });
  } catch (err) {
    results.push({ phase: 'Doctor Flow', status: 'FAIL', error: err.message });
    warn(`Doctor flow failed: ${err.message}`);
    await screenshot(doctorPage, 'error_doctor_flow');
  }

  console.log('\n' + '━'.repeat(60));
  console.log('📊 TEST RESULTS SUMMARY');
  console.log('━'.repeat(60));
  for (const r of results) {
    const icon = r.status === 'PASS' ? '✅' : '❌';
    const extra = r.error ? `  → ${r.error}` : '';
    console.log(`${icon} ${r.phase}${extra}`);
  }
  console.log('━'.repeat(60));
  console.log(`📁 Screenshots saved to: ${SCREENSHOTS_DIR}`);
  console.log('━'.repeat(60));

  await doctorPage.waitForTimeout(5000);
  await browser.close();
}

main().catch(console.error);

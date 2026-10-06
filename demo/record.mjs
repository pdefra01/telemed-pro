// Records the sales demo against the LOCAL stack: the patient books an
// immediate consultation and the doctor attends it by video call.
//
// Each role runs in its own Chromium process, because the fake-camera flags
// are per process. Raw per-role videos and a timeline land in demo/output/;
// demo/compose.mjs turns them into the final MP4s.
import { spawn, spawnSync } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { caption, installCaptions } from './lib/captions.mjs';
import { LIVEKIT, assertLocalUrl, buildAppEnv, isMainModule, readLocalSupabaseStatus } from './lib/local-env.mjs';
import { DEMO, seedLocal } from './seed-local.mjs';
import { startLivekit } from './start-livekit.mjs';
import { compose } from './compose.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..');
const CACHE_DIR = join(here, '.cache');
export const OUTPUT_DIR = join(here, 'output');
export const RAW_DIR = join(OUTPUT_DIR, 'raw');
const LOG_DIR = join(OUTPUT_DIR, 'logs');

const APP_PORT = 3000;
const API_PORT = 3001;
const BASE_URL = `http://127.0.0.1:${APP_PORT}`;
const SIZE = { width: 1280, height: 720 };
const CALL_HOLD_MS = 9000; // plain call footage before the doctor starts writing notes

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function isUp(url) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(2000) });
    return res.status < 500;
  } catch {
    return false;
  }
}

async function waitUp(url, label, timeoutMs = 90_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await isUp(url)) return;
    await sleep(500);
  }
  throw new Error(`[record] ${label} did not come up at ${url} within ${timeoutMs / 1000}s (see ${LOG_DIR}).`);
}

function killTree(child) {
  if (!child || child.exitCode !== null) return;
  if (process.platform === 'win32') {
    spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
  } else {
    child.kill('SIGTERM');
  }
}

function spawnLogged(name, args, env) {
  const log = createWriteStream(join(LOG_DIR, `${name}.log`));
  const child = spawn(process.execPath, args, { cwd: repoRoot, env, stdio: ['ignore', 'pipe', 'pipe'] });
  child.stdout.pipe(log);
  child.stderr.pipe(log);
  return child;
}

/** Starts LiveKit (if needed), server.js and Vite, all pointed at the local stack. */
async function startStack(status) {
  const env = buildAppEnv(status);
  for (const key of ['VITE_SUPABASE_URL', 'SUPABASE_URL', 'VITE_LIVEKIT_URL', 'PUBLIC_APP_URL']) {
    assertLocalUrl(key, env[key]);
  }
  for (const port of [APP_PORT, API_PORT]) {
    if (await isUp(`http://127.0.0.1:${port}`)) {
      throw new Error(`[record] Port ${port} is already in use. Stop the running dev server first: it may point at another Supabase project.`);
    }
  }

  const children = [];
  const livekitHttp = LIVEKIT.url.replace(/^ws/, 'http');
  if (!(await isUp(livekitHttp))) {
    const lk = await startLivekit({ stdio: ['ignore', 'ignore', 'ignore'] });
    children.push(lk);
    await waitUp(livekitHttp, 'LiveKit');
  }

  children.push(spawnLogged('server', ['server.js'], env));
  // Vite needs development mode; process env wins over .env files for VITE_*.
  children.push(
    spawnLogged(
      'vite',
      [join('node_modules', 'vite', 'bin', 'vite.js'), '--host', '127.0.0.1', '--port', String(APP_PORT), '--strictPort'],
      { ...env, NODE_ENV: 'development' }
    )
  );
  const stop = () => children.reverse().forEach(killTree);
  try {
    await waitUp(`http://127.0.0.1:${API_PORT}/`, 'server.js');
    await waitUp(BASE_URL, 'Vite');
  } catch (err) {
    stop();
    throw err;
  }
  return stop;
}

/** One Chromium process per role, each with its own fake camera clip. */
async function openRole(role, roleLabel, timeline) {
  const browser = await chromium.launch({
    headless: true,
    slowMo: 120,
    args: [
      '--use-fake-ui-for-media-stream',
      '--use-fake-device-for-media-stream',
      `--use-file-for-fake-video-capture=${join(CACHE_DIR, `${role}.y4m`)}`,
      `--use-file-for-fake-audio-capture=${join(CACHE_DIR, `${role}.wav`)}`,
      '--autoplay-policy=no-user-gesture-required',
    ],
  });
  const context = await browser.newContext({
    viewport: SIZE,
    recordVideo: { dir: join(RAW_DIR, role), size: SIZE },
    permissions: ['camera', 'microphone'],
    locale: 'es-AR',
    timezoneId: Intl.DateTimeFormat().resolvedOptions().timeZone,
  });
  await installCaptions(context, roleLabel);

  // Safety net: any request that leaves this machine for Supabase fails the run.
  const leaks = [];
  await context.route(/supabase\.(co|in)|railway\.app/i, (route) => {
    leaks.push(route.request().url());
    return route.abort();
  });

  const page = await context.newPage();
  timeline[role] = { start: Date.now(), marks: {} };
  page.setDefaultTimeout(30_000);
  page.on('pageerror', (err) => console.warn(`[${role}] page error: ${err.message}`));
  const mark = (name) => {
    timeline[role].marks[name] = Date.now();
  };
  const assertNoLeaks = () => {
    if (leaks.length) throw new Error(`[record] ${role} tried to reach a remote backend: ${leaks[0]}`);
  };
  return { browser, context, page, mark, assertNoLeaks };
}

async function bothVideosPlaying(page) {
  await page.waitForFunction(
    () => [...document.querySelectorAll('video')].filter((v) => v.readyState >= 2 && v.videoWidth > 0).length >= 2,
    null,
    { timeout: 60_000 }
  );
}

async function patientBooks({ page, mark }) {
  await page.goto(`${BASE_URL}/#/login`);
  await page.getByRole('button', { name: 'Pacientes' }).waitFor();
  await caption(page, 'Camila ingresa a Medinex con su DNI');
  await page.getByRole('button', { name: 'Pacientes' }).click();
  await page.locator('input[type="text"]').first().pressSequentially(DEMO.patient.dni, { delay: 90 });
  await page.locator('input[type="password"]').first().pressSequentially(DEMO.patient.password, { delay: 40 });
  await page.getByRole('button', { name: /^ingresar$/i }).click();

  const newAppointment = page.getByRole('button', { name: /nuevo turno/i });
  await newAppointment.waitFor();
  await caption(page, 'Desde su panel solicita una consulta con «Nuevo Turno»', 2200);
  await newAppointment.click();

  await caption(page, 'Elige la especialidad: Clínica médica', 600);
  await page.getByRole('button', { name: /^cl[ií]nica m[eé]dica$/i }).click();
  await page.waitForTimeout(1000);

  await caption(page, 'Selecciona a la Dra. Lucía Fernández', 600);
  await page.getByText(/luc[ií]a fern[aá]ndez/i).first().click();
  await page.waitForTimeout(1000);

  // The slot of the current hour already started: the app offers immediate care.
  await caption(page, 'Elige el horario actual para recibir atención inmediata', 600);
  const hour = `${String(new Date().getHours()).padStart(2, '0')}:00`;
  await page.getByRole('button', { name: hour, exact: true }).click();
  const immediate = page.getByRole('button', { name: /atenci[oó]n inmediata/i });
  if (await immediate.isVisible().catch(() => false)) {
    await page.waitForTimeout(900);
    await immediate.click();
  }
  await page.waitForTimeout(800);

  await caption(page, 'Confirma el turno', 600);
  await page.getByRole('button', { name: /confirmar turno/i }).click();
  mark('booked');

  const enter = page.getByRole('link', { name: /ingresar a la consulta/i }).first();
  await enter.waitFor();
  await enter.evaluate((el) => el.scrollIntoView({ behavior: 'smooth', block: 'center' }));
  await caption(page, 'El turno queda confirmado y la sala virtual, habilitada', 2400);
  await caption(page, 'Ingresa a la sala de espera virtual', 600);
  await enter.click();
  await page.waitForURL(/#\/room\//);
  mark('inRoom');
  await caption(page, 'Espera a que la médica inicie la videollamada', 3500);
  mark('waiting');
}

async function doctorAttends({ page, mark }, patient) {
  await page.goto(`${BASE_URL}/#/login`);
  await page.getByRole('button', { name: 'Médicos' }).waitFor();
  await caption(page, 'La Dra. Fernández ingresa a su panel profesional');
  await page.getByRole('button', { name: 'Médicos' }).click();
  await page.locator('input[type="text"]').first().pressSequentially(DEMO.doctor.email, { delay: 45 });
  await page.locator('input[type="password"]').first().pressSequentially(DEMO.doctor.password, { delay: 40 });
  await page.getByRole('button', { name: /^ingresar$/i }).click();
  await page.waitForFunction(() => !window.location.hash.includes('login'));

  await page.getByRole('button', { name: /sala de espera/i }).click();
  const startCall = page.getByRole('link', { name: /iniciar llamada/i }).first();
  await startCall.waitFor();
  await caption(page, 'En la Sala de Espera aparece Camila, lista para ser atendida', 3000);
  await caption(page, 'Inicia la videollamada con un clic', 800);
  mark('callClick');
  await startCall.click();
  await page.waitForURL(/#\/room\//);

  await Promise.all([bothVideosPlaying(page), bothVideosPlaying(patient.page)]);
  mark('callConnected');
  patient.mark('callConnected');
  await Promise.all([
    caption(page, 'Videollamada en curso con la paciente', 0),
    caption(patient.page, 'Camila ya está en consulta con la Dra. Fernández', 0),
  ]);
  await page.waitForTimeout(CALL_HOLD_MS);

  await caption(page, 'Durante la consulta registra la evolución médica', 600);
  await patient.page.evaluate(() => window.__demoCaption?.('Consulta por videollamada desde su casa'));
  await page.getByRole('button', { name: /evoluci[oó]n/i }).first().click();
  await page
    .getByPlaceholder(/motivo de consulta/i)
    .pressSequentially('Consulta por cefalea y congestión nasal de 48 h. Afebril. Examen por video sin signos de alarma.', {
      delay: 28,
    });
  await page.waitForTimeout(2500);

  await caption(page, 'Finaliza el turno', 800);
  mark('callEnd');
  patient.mark('callEnd');
  await page.getByRole('button', { name: /finalizar turno/i }).click();
  await patient.page.evaluate(() => window.__demoCaption?.('La consulta finalizó'));

  const diagnosis = page.locator('#diagnosis');
  await diagnosis.waitFor();
  await caption(page, 'Carga el diagnóstico para cerrar la consulta', 600);
  await diagnosis.pressSequentially('Rinosinusitis viral aguda', { delay: 60 });
  await page.waitForTimeout(800);
  await page.getByRole('button', { name: /finalizar consulta/i }).click();
  await caption(page, 'La consulta queda registrada en la historia clínica', 0);
  await page.waitForURL(/#\/doctor\/?$/, { timeout: 30_000 }).catch(() => {
    console.warn('[record] doctor was not redirected to the dashboard after finalizing; keeping the footage.');
  });
  await page.waitForTimeout(2500);
  mark('end');
}

async function closeRole(role, handle) {
  if (!handle) return null;
  const video = handle.page.video();
  const target = join(RAW_DIR, `${role}.webm`);
  try {
    // The video is finalized when its context closes; saveAs needs the browser alive.
    await handle.context.close();
    if (!video) return null;
    await video.saveAs(target);
    await video.delete().catch(() => {});
    return target;
  } catch (err) {
    console.warn(`[record] could not save the ${role} video: ${err.message}`);
    return null;
  } finally {
    await handle.browser.close().catch(() => {});
  }
}

async function screenshotOnError(role, handle) {
  if (!handle) return;
  await handle.page.screenshot({ path: join(LOG_DIR, `error-${role}.png`) }).catch(() => {});
}

export async function record() {
  const status = readLocalSupabaseStatus(repoRoot);
  await rm(RAW_DIR, { recursive: true, force: true });
  await mkdir(RAW_DIR, { recursive: true });
  await mkdir(LOG_DIR, { recursive: true });

  // Clean slate on every run: the seed deletes previous demo appointments.
  await seedLocal(status);
  const stopStack = await startStack(status);

  const timeline = {};
  let patient;
  let doctor;
  try {
    patient = await openRole('patient', 'Paciente', timeline);
    await patientBooks(patient);
    doctor = await openRole('doctor', 'Médica', timeline);
    await doctorAttends(doctor, patient);
    await patient.page.waitForTimeout(1500);
    patient.mark('end');
    patient.assertNoLeaks();
    doctor.assertNoLeaks();
  } catch (err) {
    await screenshotOnError('patient', patient);
    await screenshotOnError('doctor', doctor);
    throw err;
  } finally {
    timeline.files = {
      patient: await closeRole('patient', patient),
      doctor: await closeRole('doctor', doctor),
    };
    await writeFile(join(OUTPUT_DIR, 'timeline.json'), JSON.stringify(timeline, null, 2));
    stopStack();
  }
  console.log(`[record] raw videos in ${RAW_DIR}`);
  return timeline;
}

if (isMainModule(import.meta.url)) {
  record()
    .then(() => compose())
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err.stack || err.message || err);
      process.exit(1);
    });
}

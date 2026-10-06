// Records the sales demo against the LOCAL stack: the patient books an
// immediate consultation, the doctor attends it by video call, issues a
// prescription, and the patient finds it in her dashboard.
//
// Each role runs in its own Chromium process, because the fake-camera flags
// are per process. Raw per-role videos and a timeline land in demo/output/;
// demo/compose.mjs turns them into the final MP4s.
//
// Pacing: the recording itself is slow on purpose (readable captions, human
// typing, a held video call) so consulta-completa.mp4 runs about 2 minutes.
import { spawn, spawnSync } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { caption, captionSafely, installCaptions } from './lib/captions.mjs';
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
const CALL_HOLD_MS = 9000; // per caption of plain call footage, before the doctor writes notes
// Extra delay per key for pressSequentially; slowMo already slows every key.
const TYPE = { slow: 90, normal: 30, fast: 10 };

// Demo-only: WhatsApp (WAHA) is not configured locally, so the server answers
// 503 whatsapp_disabled. The doctor's browser gets the success response the
// client expects instead; the app and the server stay untouched.
const WHATSAPP_ROUTE = '**/api/prescriptions/*/send-whatsapp';
const WHATSAPP_OK = { status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'sent' }) };

const PRESCRIPTION = [
  { med: 'Ibuprofeno 400 mg', dose: '1 comp. cada 8 h por 3 días' },
  { med: 'Loratadina 10 mg', dose: '1 comp. por día por 5 días' },
];

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

/**
 * Starts LiveKit (if needed), server.js and Vite, all pointed at the local
 * stack. Returns an idempotent stop(); every child started so far is stopped
 * if any later step fails.
 */
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
  let stopped = false;
  const stop = () => {
    if (stopped) return;
    stopped = true;
    children.reverse().forEach(killTree);
  };
  try {
    const livekitHttp = LIVEKIT.url.replace(/^ws/, 'http');
    if (!(await isUp(livekitHttp))) {
      children.push(await startLivekit({ stdio: ['ignore', 'ignore', 'ignore'] }));
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

  // The video starts when the page is created: take the origin just before
  // that, so the marks are not shifted by how long newPage() takes to return.
  timeline[role] = { start: Date.now(), marks: {} };
  const page = await context.newPage();
  page.setDefaultTimeout(30_000);
  page.on('pageerror', (err) => console.warn(`[${role}] page error: ${err.message}`));
  const mark = (name) => {
    timeline[role].marks[name] = Date.now();
  };
  const assertNoLeaks = () => {
    if (leaks.length) throw new Error(`[record] ${role} tried to reach a remote backend: ${leaks[0]}`);
  };
  return { role, browser, context, page, mark, assertNoLeaks };
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
  await page.locator('input[type="text"]').first().pressSequentially(DEMO.patient.dni, { delay: TYPE.slow });
  await page.locator('input[type="password"]').first().pressSequentially(DEMO.patient.password, { delay: TYPE.fast });
  await page.waitForTimeout(600);
  await page.getByRole('button', { name: /^ingresar$/i }).click();

  const newAppointment = page.getByRole('button', { name: /nuevo turno/i });
  await newAppointment.waitFor();
  await page.waitForTimeout(600);
  await caption(page, 'En su panel ve su plan y pide atención con «Nuevo Turno»', 4200);
  await newAppointment.click();

  await caption(page, 'Elige la especialidad: Clínica médica', 2400);
  await page.getByRole('button', { name: /^cl[ií]nica m[eé]dica$/i }).click();
  await page.waitForTimeout(800);

  await caption(page, 'Selecciona a la Dra. Lucía Fernández', 2400);
  await page.getByText(/luc[ií]a fern[aá]ndez/i).first().click();
  await page.waitForTimeout(800);

  // The slot of the current hour already started. On "today" the app warns
  // and offers immediate care; otherwise it just selects the slot. Wait for
  // whichever of the two the click produced instead of probing once.
  await caption(page, 'Elige el horario actual para recibir atención inmediata', 2600);
  const hour = `${String(new Date().getHours()).padStart(2, '0')}:00`;
  await page.getByRole('button', { name: hour, exact: true }).click();
  const immediate = page.getByRole('button', { name: /atenci[oó]n inmediata/i });
  const selected = page.locator('button.bg-emerald-500', { hasText: hour });
  await immediate.or(selected).first().waitFor();
  if (await immediate.isVisible()) {
    await page.waitForTimeout(1000);
    await immediate.click();
  }
  await selected.waitFor();
  await page.waitForTimeout(600);

  await caption(page, 'Confirma el turno', 2000);
  await page.getByRole('button', { name: /confirmar turno/i }).click();
  mark('booked');

  const enter = page.getByRole('link', { name: /ingresar a la consulta/i }).first();
  await enter.waitFor();
  await enter.evaluate((el) => el.scrollIntoView({ behavior: 'smooth', block: 'center' }));
  await caption(page, 'El turno queda confirmado y la sala virtual, habilitada', 3400);
  await caption(page, 'Ingresa a la sala de espera virtual', 2000);
  await enter.click();
  await page.waitForURL(/#\/room\//);
  mark('inRoom');
  await caption(page, 'Espera a que la médica inicie la videollamada', 3500);
  mark('waiting');
}

async function writePrescription(page) {
  await page.getByRole('button', { name: /^receta$/i }).click();
  await page.waitForTimeout(600);
  for (const [i, item] of PRESCRIPTION.entries()) {
    await page.getByRole('button', { name: /^agregar$/i }).click();
    await page.getByPlaceholder(/amoxicilina/i).nth(i).pressSequentially(item.med, { delay: TYPE.normal });
    await page.getByPlaceholder(/comp\. cada/i).nth(i).pressSequentially(item.dose, { delay: TYPE.fast });
    await page.waitForTimeout(600);
  }
}

async function doctorAttends(doctor, patient) {
  const { page, mark, context } = doctor;
  doctor.whatsappMocked = 0;
  await context.route(WHATSAPP_ROUTE, (route) => {
    doctor.whatsappMocked += 1;
    return route.fulfill(WHATSAPP_OK);
  });

  await page.goto(`${BASE_URL}/#/login`);
  await page.getByRole('button', { name: 'Médicos' }).waitFor();
  await caption(page, 'La Dra. Fernández ingresa a su panel profesional');
  await page.getByRole('button', { name: 'Médicos' }).click();
  await page.locator('input[type="text"]').first().pressSequentially(DEMO.doctor.email, { delay: TYPE.fast });
  await page.locator('input[type="password"]').first().pressSequentially(DEMO.doctor.password, { delay: TYPE.fast });
  await page.waitForTimeout(600);
  await page.getByRole('button', { name: /^ingresar$/i }).click();
  await page.waitForFunction(() => !window.location.hash.includes('login'));
  await page.waitForTimeout(800);

  await page.getByRole('button', { name: /sala de espera/i }).click();
  const startCall = page.getByRole('link', { name: /iniciar llamada/i }).first();
  await startCall.waitFor();
  await caption(page, 'En la Sala de Espera aparece Camila, lista para ser atendida', 3800);
  await caption(page, 'Inicia la videollamada con un clic', 2000);
  mark('callClick');
  await startCall.click();
  await page.waitForURL(/#\/room\//);

  await Promise.all([bothVideosPlaying(page), bothVideosPlaying(patient.page)]);
  mark('callConnected');
  patient.mark('callConnected');
  await Promise.all([
    caption(page, 'Videollamada en curso con la paciente', 0),
    captionSafely(patient.page, 'Camila ya está en consulta con la Dra. Fernández'),
  ]);
  await page.waitForTimeout(CALL_HOLD_MS);
  await Promise.all([
    caption(page, 'Imagen y sonido en vivo, directo desde el navegador', 0),
    captionSafely(patient.page, 'Consulta por videollamada desde su casa, sin instalar nada'),
  ]);
  await page.waitForTimeout(CALL_HOLD_MS);

  mark('notes');
  await caption(page, 'Durante la consulta registra la evolución médica', 2000);
  await page.getByRole('button', { name: /evoluci[oó]n/i }).first().click();
  await page
    .getByPlaceholder(/motivo de consulta/i)
    .pressSequentially('Cefalea y congestión nasal de 48 h. Afebril, sin signos de alarma.', { delay: TYPE.fast });
  await page.waitForTimeout(1200);

  await caption(page, 'En la pestaña Receta indica los medicamentos', 2000);
  await writePrescription(page);
  await caption(page, 'Ibuprofeno y loratadina, con su posología', 3200);

  await caption(page, 'Finaliza el turno', 1600);
  mark('callEnd');
  patient.mark('callEnd');
  await page.getByRole('button', { name: /finalizar turno/i }).click();
  await captionSafely(patient.page, 'La consulta finalizó');

  const diagnosis = page.locator('#diagnosis');
  await diagnosis.waitFor();
  await page.waitForTimeout(500);
  await caption(page, 'Carga el diagnóstico para cerrar la consulta', 2000);
  await diagnosis.pressSequentially('Rinosinusitis viral aguda', { delay: TYPE.normal });
  await page.waitForTimeout(600);

  const rxHeading = page.getByRole('heading', { name: /receta electr[oó]nica/i });
  await rxHeading.evaluate((el) => el.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  await caption(page, 'La receta llega cargada con lo indicado durante la llamada', 3600);

  await caption(page, 'Al finalizar se genera la receta en PDF y se envía a la paciente', 2400);
  await page.getByRole('button', { name: /finalizar consulta/i }).click();
  await page.getByRole('button', { name: /enviado por whatsapp/i }).waitFor({ timeout: 60_000 });
  mark('rxSent');
  // The app returns to the dashboard 3.5 s after success; the caption fits that.
  await caption(page, 'Receta emitida y enviada por WhatsApp desde el número de Medinex', 0);
  await page.waitForURL((url) => !url.hash.includes('post-consultation'), { timeout: 30_000 }).catch(() => {
    console.warn('[record] doctor was not redirected to the dashboard after finalizing; keeping the footage.');
  });
  await caption(page, 'La consulta queda registrada en la historia clínica', 2800);
  mark('end');
}

async function patientSeesPrescription({ page, mark }) {
  await page.goto(`${BASE_URL}/#/`);
  const heading = page.getByRole('heading', { name: /mis recetas/i });
  await heading.waitFor();
  mark('rxStart');
  await caption(page, 'Camila vuelve a su panel', 1500);
  await page.getByText(/2 medicamentos/i).first().waitFor({ timeout: 30_000 });
  await heading.evaluate((el) => el.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  await caption(page, 'La receta ya está disponible en «Mis Recetas», lista para descargar', 5000);
  mark('end');
}

async function closeRole(handle) {
  if (!handle) return null;
  const video = handle.page.video();
  const target = join(RAW_DIR, `${handle.role}.webm`);
  try {
    // The video is finalized when its context closes; saveAs needs the browser alive.
    await handle.context.close();
    if (!video) return null;
    await video.saveAs(target);
    await video.delete().catch(() => {});
    return target;
  } catch (err) {
    console.warn(`[record] could not save the ${handle.role} video: ${err.message}`);
    return null;
  } finally {
    await handle.browser.close().catch(() => {});
  }
}

async function screenshotOnError(handle) {
  if (!handle) return;
  await handle.page.screenshot({ path: join(LOG_DIR, `error-${handle.role}.png`) }).catch(() => {});
}

export async function record() {
  const status = readLocalSupabaseStatus(repoRoot);
  await rm(RAW_DIR, { recursive: true, force: true });
  await mkdir(RAW_DIR, { recursive: true });
  await mkdir(LOG_DIR, { recursive: true });

  // Clean slate on every run: the seed deletes previous demo appointments.
  await seedLocal(status);

  let stopStack = () => {};
  // Ctrl+C must not leave server.js, Vite or LiveKit running.
  const onSignal = () => {
    stopStack();
    process.exit(130);
  };
  process.once('SIGINT', onSignal);
  process.once('SIGTERM', onSignal);

  const timeline = {};
  let patient;
  let doctor;
  try {
    stopStack = await startStack(status);
    try {
      patient = await openRole('patient', 'Paciente', timeline);
      await patientBooks(patient);
      doctor = await openRole('doctor', 'Médica', timeline);
      await doctorAttends(doctor, patient);
      await patientSeesPrescription(patient);
      patient.assertNoLeaks();
      doctor.assertNoLeaks();
      if (doctor.whatsappMocked < 1) throw new Error('[record] the prescription was never sent by WhatsApp (mock not hit).');
    } catch (err) {
      await screenshotOnError(patient);
      await screenshotOnError(doctor);
      throw err;
    } finally {
      timeline.files = { patient: await closeRole(patient), doctor: await closeRole(doctor) };
      await writeFile(join(OUTPUT_DIR, 'timeline.json'), JSON.stringify(timeline, null, 2)).catch((err) =>
        console.warn(`[record] could not write the timeline: ${err.message}`)
      );
    }
  } finally {
    stopStack();
    process.off('SIGINT', onSignal);
    process.off('SIGTERM', onSignal);
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

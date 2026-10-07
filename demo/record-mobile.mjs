// Records the PATIENT's side of the demo on an emulated phone (Pixel 7:
// touch, mobile viewport and user agent): she books an immediate
// consultation, joins the video call from her phone, and opens the
// prescription PDF afterwards. The doctor still runs in her own desktop
// Chromium to drive the call; only the patient's video is used.
//
// The captions are not drawn inside the app: they are logged as timed cues
// and drawn below the phone mockup by demo/compose-mobile.mjs, which turns
// the raw recording into demo/output/paciente-celular.mp4 (1080x1920).
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { devices } from 'playwright';
import { caption, captionCues } from './lib/captions.mjs';
import { isMainModule, readLocalSupabaseStatus, toLocalStorageUrl } from './lib/local-env.mjs';
import {
  BASE_URL,
  LOG_DIR,
  OUTPUT_DIR,
  TYPE,
  closeRole,
  sleep,
  createStack,
  doctorAttends,
  openRole,
  screenshotOnError,
  startStack,
} from './record.mjs';
import { DEMO, seedLocal } from './seed-local.mjs';
import { composeMobile } from './compose-mobile.mjs';

export const RAW_MOBILE_DIR = join(OUTPUT_DIR, 'raw-mobile');
export const MOBILE_TIMELINE = join(OUTPUT_DIR, 'timeline-mobile.json');

// Playwright's Pixel 7 profile, minus the browser choice (the role picks it).
const { defaultBrowserType: _browser, ...PHONE } = devices['Pixel 7'];
// Playwright records the page in CSS pixels: a larger video size only pads
// it. compose-mobile.mjs scales the screen up (lanczos) into the mockup.
const PHONE_VIDEO = { ...PHONE.viewport };

// The PDF viewer of an emulated phone lays the PDF out on a 980 px desktop
// page (tiny, with a thumbnail sidebar). Embedded in a page of the same
// origin, it fits the phone width instead. This viewer page is served by
// Playwright, not by the app, and only for the local storage origin.
const VIEWER_PATH = '/__demo/receta';
function viewerPage(pdfUrl) {
  const { pathname, search } = new URL(pdfUrl);
  const src = `${pathname}${search}#toolbar=0&navpanes=0&view=FitH`;
  return `<!doctype html><html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>Receta electrónica</title>
<style>
  html, body { margin: 0; height: 100%; background: #e5e7eb; font-family: 'Segoe UI', system-ui, sans-serif; }
  header { height: 56px; display: flex; align-items: center; gap: 14px; padding: 0 16px; background: #0f172a; color: #f8fafc; }
  header .back { font-size: 22px; line-height: 1; }
  header .title { font-weight: 600; font-size: 16px; }
  header .sub { font-size: 12px; color: #5eead4; }
  iframe { display: block; border: 0; width: 100%; height: calc(100% - 56px); background: #e5e7eb; }
</style></head><body>
<header><span class="back">&#8592;</span><div><div class="title">Receta electrónica</div><div class="sub">PDF · Medinex</div></div></header>
<iframe src="${src.replace(/"/g, '&quot;')}"></iframe>
</body></html>`;
}

// Optional debugging aid: DEMO_SHOTS_DIR=<dir> saves a screenshot per step.
const SHOTS_DIR = process.env.DEMO_SHOTS_DIR;
async function shot(page, name) {
  if (!SHOTS_DIR) return;
  await page.screenshot({ path: join(SHOTS_DIR, `mobile-${name}.png`) }).catch(() => {});
}

const centerOf = (locator) => locator.evaluate((el) => el.scrollIntoView({ behavior: 'smooth', block: 'center' }));

async function patientBooksOnPhone({ page, mark }) {
  await page.goto(`${BASE_URL}/#/login`);
  const patients = page.getByRole('button', { name: 'Pacientes' });
  await patients.waitFor();
  await shot(page, '01-login');
  await caption(page, 'Camila abre Medinex desde su celular', 3200);
  await patients.tap();
  await caption(page, 'Ingresa con su DNI y su contraseña', 0);
  await page.locator('input[type="text"]').first().tap();
  await page.locator('input[type="text"]').first().pressSequentially(DEMO.patient.dni, { delay: TYPE.slow });
  await page.locator('input[type="password"]').first().tap();
  await page.locator('input[type="password"]').first().pressSequentially(DEMO.patient.password, { delay: TYPE.fast });
  await page.waitForTimeout(800);
  await page.getByRole('button', { name: /^ingresar$/i }).tap();

  const newAppointment = page.getByRole('button', { name: /nuevo turno/i });
  await newAppointment.waitFor();
  await page.waitForTimeout(800);
  await shot(page, '02-dashboard');
  await caption(page, 'En su panel ve su plan y sus próximos turnos', 3600);
  await centerOf(newAppointment);
  await caption(page, 'Pide atención con «Nuevo Turno»', 2400);
  await newAppointment.tap();

  await page.getByRole('button', { name: /^cl[ií]nica m[eé]dica$/i }).waitFor();
  await shot(page, '03-specialty');
  await caption(page, 'Elige la especialidad: Clínica médica', 2600);
  await page.getByRole('button', { name: /^cl[ií]nica m[eé]dica$/i }).tap();
  await page.waitForTimeout(900);

  const doctor = page.getByText(/luc[ií]a fern[aá]ndez/i).first();
  await centerOf(doctor);
  await shot(page, '04-doctor');
  await caption(page, 'Selecciona a la Dra. Lucía Fernández', 2600);
  await doctor.tap();
  await page.waitForTimeout(900);

  // Same two outcomes as the desktop recording: on "today" the started slot
  // offers immediate care; otherwise it is simply selected.
  const hour = `${String(new Date().getHours()).padStart(2, '0')}:00`;
  const slot = page.getByRole('button', { name: hour, exact: true });
  await centerOf(slot);
  await shot(page, '05-slots');
  await caption(page, 'Toca el horario actual para recibir atención inmediata', 3000);
  await slot.tap();
  const immediate = page.getByRole('button', { name: /atenci[oó]n inmediata/i });
  const confirm = page.getByRole('button', { name: /confirmar turno/i, disabled: false });
  await immediate.or(confirm).first().waitFor();
  if (await immediate.isVisible()) {
    await centerOf(immediate);
    await page.waitForTimeout(1000);
    await immediate.tap();
  }
  await confirm.waitFor();
  await centerOf(confirm);
  await page.waitForTimeout(700);
  await shot(page, '06-confirm');
  await caption(page, 'Confirma el turno', 2200);
  await confirm.tap();
  mark('booked');

  const enter = page.getByRole('link', { name: /ingresar a la consulta/i }).first();
  await enter.waitFor();
  await centerOf(enter);
  await shot(page, '07-booked');
  await caption(page, 'El turno queda confirmado y la sala virtual, habilitada', 3600);
  await caption(page, 'Entra a la consulta con un toque', 2200);
  await enter.tap();
  await page.waitForURL(/#\/room\//);
  mark('inRoom');
  await page.waitForTimeout(1500);
  await shot(page, '08-waiting');
  await caption(page, 'Espera en la sala virtual a que la médica inicie la llamada', 4000);
  mark('waiting');
}

/**
 * Resolves once the role has the given mark, so the patient can act while
 * the doctor's script keeps running; rejects if that script fails first.
 */
async function markReached(role, name, running) {
  let failed;
  running.catch((err) => {
    failed = err;
  });
  while (!role.marks[name]) {
    if (failed) throw failed;
    await sleep(200);
  }
}

/** When the doctor ends the call, the room shows "waiting" again: she leaves. */
async function patientLeavesRoom({ page, mark }) {
  await page.waitForTimeout(2200);
  await caption(page, 'Camila sale de la sala con un toque', 2000);
  await page.getByTitle(/salir de la sala/i).tap();
  await page.waitForURL((url) => !url.hash.includes('/room/'));
  mark('leftRoom');
  await caption(page, 'La médica completa el diagnóstico y emite la receta', 0);
}

async function patientOpensPrescription({ page, mark }, apiUrl) {
  if (!page.url().includes('#/patient')) await page.goto(`${BASE_URL}/#/`);
  const heading = page.getByRole('heading', { name: /mis recetas/i });
  await heading.waitFor();
  mark('rxStart');
  await caption(page, 'Camila vuelve a su panel', 1600);
  // As on desktop, the dashboard can keep pre-consultation data after the
  // hash change from the room: reload once if the new receta is missing.
  const rxCard = page.getByText(/2 medicamentos/i).first();
  if (!(await rxCard.waitFor({ timeout: 8000 }).then(() => true, () => false))) {
    await page.reload();
    await heading.waitFor();
    await rxCard.waitFor({ timeout: 30_000 });
  }
  await heading.evaluate((el) => el.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  await page.waitForTimeout(900);
  await shot(page, '10-recetas');
  await caption(page, 'La receta ya está en «Mis Recetas»', 4200);

  // Same local rewrite of the kong:8000 signed URL as the desktop recording,
  // shown in this tab through the phone viewer page (see viewerPage).
  const pdfLink = page.getByTitle(/descargar pdf/i).first();
  const localUrl = toLocalStorageUrl(await pdfLink.getAttribute('href'), apiUrl);
  const viewerUrl = new URL(VIEWER_PATH, localUrl).toString();
  await page.context().route(viewerUrl, (route) =>
    route.fulfill({ contentType: 'text/html; charset=utf-8', body: viewerPage(localUrl) })
  );
  await pdfLink.evaluate((el, href) => {
    el.setAttribute('href', href);
    el.removeAttribute('target');
  }, viewerUrl);
  await caption(page, 'La abre en PDF con un toque', 2600);
  await pdfLink.tap();
  await page.waitForURL((url) => url.pathname === VIEWER_PATH, { timeout: 30_000 });
  mark('pdf');
  await caption(page, 'Receta electrónica lista para presentar en la farmacia', 0);
  await page.waitForTimeout(6000);
  await shot(page, '11-pdf');
  await page.waitForTimeout(5000);
  await caption(page, 'Medinex: su médico en casa, al instante', 0);
  await page.waitForTimeout(5000);
  mark('end');
}

export async function recordMobile() {
  const status = readLocalSupabaseStatus(join(dirname(fileURLToPath(import.meta.url)), '..'));
  await rm(RAW_MOBILE_DIR, { recursive: true, force: true });
  await mkdir(RAW_MOBILE_DIR, { recursive: true });
  await mkdir(LOG_DIR, { recursive: true });
  if (SHOTS_DIR) await mkdir(SHOTS_DIR, { recursive: true });
  await seedLocal(status);

  const stack = createStack();
  const onSignal = () => {
    stack.stop();
    process.exit(130);
  };
  process.once('SIGINT', onSignal);
  process.once('SIGTERM', onSignal);

  const timeline = {};
  let patient;
  let doctor;
  try {
    await startStack(status, stack);
    try {
      patient = await openRole('patient', 'Paciente', timeline, {
        channel: 'chromium',
        rawDir: RAW_MOBILE_DIR,
        videoSize: PHONE_VIDEO,
        contextOptions: PHONE,
        captions: { overlay: false, touch: true },
      });
      await patientBooksOnPhone(patient);
      doctor = await openRole('doctor', 'Médica', timeline, { rawDir: RAW_MOBILE_DIR });
      const attending = doctorAttends(doctor, patient);
      await markReached(timeline.patient, 'callConnected', attending);
      await sleep(12_000);
      await shot(patient.page, '09-call');
      // While the doctor fills in the prescription the phone only shows the
      // call: two more captions (cues only, the page is not touched).
      await markReached(timeline.doctor, 'notesSaved', attending);
      await sleep(3000);
      if (!timeline.patient.marks.callEnd) await caption(patient.page, 'La médica le explica el tratamiento mientras prepara la receta', 0);
      await sleep(11_000);
      if (!timeline.patient.marks.callEnd) await caption(patient.page, 'Todo desde el celular: sin traslados ni salas de espera', 0);
      await markReached(timeline.patient, 'callEnd', attending);
      await patientLeavesRoom(patient);
      await attending;
      await patientOpensPrescription(patient, status.apiUrl);
      patient.assertNoLeaks();
      doctor.assertNoLeaks();
      if (doctor.whatsappMocked < 1) throw new Error('[record-mobile] the prescription was never sent by WhatsApp (mock not hit).');
    } catch (err) {
      await screenshotOnError(patient);
      await screenshotOnError(doctor);
      throw err;
    } finally {
      if (patient) {
        timeline.patient.cues = captionCues(patient.context);
        timeline.viewport = PHONE.viewport;
      }
      timeline.files = { patient: await closeRole(patient), doctor: await closeRole(doctor) };
      await writeFile(MOBILE_TIMELINE, JSON.stringify(timeline, null, 2)).catch((err) =>
        console.warn(`[record-mobile] could not write the timeline: ${err.message}`)
      );
    }
  } finally {
    stack.stop();
    process.off('SIGINT', onSignal);
    process.off('SIGTERM', onSignal);
  }
  console.log(`[record-mobile] raw videos in ${RAW_MOBILE_DIR}`);
  return timeline;
}

if (isMainModule(import.meta.url)) {
  recordMobile()
    .then(() => composeMobile())
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err.stack || err.message || err);
      process.exit(1);
    });
}

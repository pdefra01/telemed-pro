// Turns the raw phone recording of the patient (demo/record-mobile.mjs) into
// demo/output/paciente-celular.mp4: vertical 1080x1920, the phone screen
// inside a mockup on a Medinex-branded background, with the captions drawn
// below the phone. Waiting time and the doctor's paperwork are cut out.
import { readFileSync } from 'node:fs';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { durationMs, ffmpeg, videoClock } from './compose.mjs';
import { isMainModule } from './lib/local-env.mjs';
import { captionTrack, phoneLayout } from './lib/phone-layout.mjs';
import { backgroundHtml, captionHtml, frameHtml } from './lib/phone-stage.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = join(here, 'output');
const TMP_DIR = join(OUTPUT_DIR, 'tmp-mobile');
const OUTPUT = join(OUTPUT_DIR, 'paciente-celular.mp4');
const LOGO = join(here, '..', 'src', 'logo_medinex.jpeg');

const FPS = 30;
const FADE = 0.3; // seconds, at every cut and for every caption
const LEAD_IN_MS = 1200; // before the first caption
const CALL_MS = 75_000; // longest call footage kept before cutting to its end
const PDF_PAINT_MS = 1500; // the embedded viewer paints the receta quickly
const ENCODE = ['-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-pix_fmt', 'yuv420p', '-r', String(FPS), '-an'];
const sec = (ms) => (Math.max(0, ms) / 1000).toFixed(3);

/** The parts of the patient's recording that make the video, in video ms. */
function segments(at) {
  const callStart = at('callConnected') - 1500;
  const leaving = at('leftRoom') + 2500;
  // A call longer than CALL_MS is cut from its middle to its last second.
  const call =
    at('callEnd') - at('callConnected') <= CALL_MS
      ? [{ name: 'llamada', start: callStart, end: leaving }]
      : [
          { name: 'llamada', start: callStart, end: at('callConnected') + CALL_MS },
          { name: 'fin-llamada', start: at('callEnd') - 1000, end: leaving },
        ];
  const parts = [
    { name: 'reserva', start: Math.max(0, at('cue0') - LEAD_IN_MS), end: at('waiting') },
    ...call,
    { name: 'recetas', start: at('rxStart'), end: at('pdf') },
    { name: 'pdf', start: at('pdf') + PDF_PAINT_MS, end: at('end') },
  ];
  for (const [i, p] of parts.entries()) {
    if (!(p.end > p.start) || (i > 0 && p.start < parts[i - 1].end)) {
      throw new Error(`[compose-mobile] segment ${p.name} is empty or overlaps the previous one; re-record.`);
    }
  }
  return parts;
}

async function renderStills(layout, track) {
  const logo = `data:image/jpeg;base64,${readFileSync(LOGO).toString('base64')}`;
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: layout.canvas.width, height: layout.canvas.height } });
    const still = async (html, file, size) => {
      await page.setViewportSize(size);
      await page.setContent(html, { waitUntil: 'load' });
      await page.screenshot({ path: file, omitBackground: true });
      return file;
    };
    const canvas = { width: layout.canvas.width, height: layout.canvas.height };
    const band = { width: layout.canvas.width, height: layout.captions.height };
    const background = await still(backgroundHtml(layout), join(TMP_DIR, 'background.png'), canvas);
    const frame = await still(frameHtml(layout, logo), join(TMP_DIR, 'frame.png'), canvas);
    const captions = [];
    for (const [i, c] of track.entries()) {
      captions.push(await still(captionHtml(layout, c.text), join(TMP_DIR, `caption-${i}.png`), band));
    }
    return { background, frame, captions };
  } finally {
    await browser.close();
  }
}

export async function composeMobile() {
  const timeline = JSON.parse(await readFile(join(OUTPUT_DIR, 'timeline-mobile.json'), 'utf8'));
  const { patient, files, viewport } = timeline;
  if (!files?.patient || !viewport) throw new Error('[compose-mobile] Missing raw recording; run `npm run demo:record:mobile` first.');
  for (const m of ['waiting', 'callConnected', 'callEnd', 'leftRoom', 'rxStart', 'pdf', 'end', 'closing']) {
    if (!patient.marks[m]) throw new Error(`[compose-mobile] timeline is missing patient.${m}; the recording did not finish.`);
  }
  if (!patient.cues?.length) throw new Error('[compose-mobile] the recording has no caption cues.');

  // Cues share the marks' wall clock: map both onto the (drifting) video clock.
  const marks = { ...patient.marks };
  patient.cues.forEach((c, i) => (marks[`cue${i}`] = c.at));
  const at = videoClock({ ...patient, marks }, durationMs(files.patient));
  const parts = segments(at);
  const cues = patient.cues.map((c, i) => ({ text: c.text, at: at(`cue${i}`) }));
  const track = captionTrack(cues, parts);
  const totalMs = parts.reduce((sum, p) => sum + p.end - p.start, 0);

  const layout = phoneLayout(viewport);
  const { screen, captions } = layout;
  await rm(TMP_DIR, { recursive: true, force: true });
  await mkdir(TMP_DIR, { recursive: true });

  console.log(`[compose-mobile] ${parts.length} cuts, ${track.length} captions, ${(totalMs / 1000).toFixed(1)} s`);
  const clips = parts.map((p, i) => {
    const out = join(TMP_DIR, `${i}-${p.name}.mp4`);
    const d = (p.end - p.start) / 1000;
    const fades = `fade=t=in:st=0:d=${FADE},fade=t=out:st=${Math.max(0, d - FADE).toFixed(3)}:d=${FADE}`;
    ffmpeg([
      '-ss', sec(p.start), '-t', d.toFixed(3), '-i', files.patient,
      '-vf', `scale=${screen.width}:${screen.height}:flags=lanczos,setsar=1,fps=${FPS},${fades}`,
      ...ENCODE, out,
    ]);
    return out;
  });
  const list = join(TMP_DIR, 'concat.txt');
  await writeFile(list, clips.map((f) => `file '${f.replaceAll('\\', '/')}'`).join('\n'));
  const screenVideo = join(TMP_DIR, 'screen.mp4');
  ffmpeg(['-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', screenVideo]);

  const stills = await renderStills(layout, track);
  const total = sec(totalMs);
  const inputs = ['-i', screenVideo, '-loop', '1', '-i', stills.background, '-loop', '1', '-i', stills.frame];
  const graph = [
    `[1:v]format=rgba[bg]`,
    `[bg][0:v]overlay=x=${screen.x}:y=${screen.y}:eof_action=pass[s]`,
    `[s][2:v]overlay=x=0:y=0[v0]`,
  ];
  track.forEach((c, i) => {
    inputs.push('-loop', '1', '-i', stills.captions[i]);
    const from = c.from / 1000;
    const to = c.to / 1000;
    const fade = Math.min(FADE, (to - from) / 3).toFixed(3);
    graph.push(
      `[${i + 3}:v]format=rgba,fade=t=in:st=${from.toFixed(3)}:d=${fade}:alpha=1,` +
        `fade=t=out:st=${(to - Number(fade)).toFixed(3)}:d=${fade}:alpha=1[c${i}]`,
      `[v${i}][c${i}]overlay=x=0:y=${captions.y}:enable='between(t,${from.toFixed(3)},${to.toFixed(3)})'[v${i + 1}]`
    );
  });
  graph.push(`[v${track.length}]fps=${FPS},format=yuv420p[out]`);
  const script = join(TMP_DIR, 'graph.txt');
  await writeFile(script, graph.join(';\n'));
  console.log('[compose-mobile] paciente-celular.mp4');
  ffmpeg([...inputs, '-/filter_complex', script, '-map', '[out]', '-t', total, ...ENCODE, '-movflags', '+faststart', OUTPUT]);
  await rm(TMP_DIR, { recursive: true, force: true });
  console.log(`[compose-mobile] done: ${OUTPUT}`);
}

if (isMainModule(import.meta.url)) {
  composeMobile().catch((err) => {
    console.error(err.message || err);
    process.exit(1);
  });
}

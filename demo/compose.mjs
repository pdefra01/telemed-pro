// Turns the raw per-role recordings into the final demo videos:
//   paciente.mp4, medico.mp4 and consulta-completa.mp4 (sequenced, with a
//   side-by-side section during the video call, then the prescription and the
//   patient finding it in her dashboard). All 1280x720, H.264.
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isMainModule } from './lib/local-env.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = join(here, 'output');
const TMP_DIR = join(OUTPUT_DIR, 'tmp');
const FPS = 30;
const FADE = 0.35;
const ENCODE = ['-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-pix_fmt', 'yuv420p', '-r', String(FPS), '-an'];

// drawtext needs a font file; the drive colon must be escaped inside the filter.
const FONT = ['C:/Windows/Fonts/segoeuib.ttf', 'C:/Windows/Fonts/arialbd.ttf', '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'].find(
  (f) => existsSync(f)
);
const fontOpt = FONT ? `fontfile='${FONT.replace(':', '\\:')}':` : '';

function ffmpeg(args) {
  const res = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args], { encoding: 'utf8' });
  if (res.status !== 0) throw new Error(`[compose] ffmpeg failed: ${res.stderr || res.error?.message}`);
}

const sec = (ms) => Math.max(0, ms / 1000).toFixed(3);
const fades = (duration) => `fade=t=in:st=0:d=${FADE},fade=t=out:st=${Math.max(0, duration - FADE).toFixed(3)}:d=${FADE}`;
const fit = 'scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2:color=0x020617,setsar=1';

function clip(input, startMs, endMs, out) {
  const duration = (endMs - startMs) / 1000;
  ffmpeg(['-ss', sec(startMs), '-t', duration.toFixed(3), '-i', input, '-vf', `${fit},fps=${FPS},${fades(duration)}`, ...ENCODE, out]);
  return out;
}

function text(value, x, y, size, color = 'white') {
  return `drawtext=${fontOpt}text='${value}':fontcolor=${color}:fontsize=${size}:x=${x}:y=${y}`;
}

function sideBySide(patient, doctor, patientStartMs, doctorStartMs, durationMs, out) {
  const d = durationMs / 1000;
  const panel = 'scale=624:351,setsar=1';
  const graph = [
    `[0:v]${panel}[p]`,
    `[1:v]${panel}[d]`,
    `color=c=0x020617:s=1280x720:r=${FPS}:d=${d.toFixed(3)}[bg]`,
    `[bg][p]overlay=x=11:y=175:shortest=1[a]`,
    `[a][d]overlay=x=645:y=175:shortest=1[b]`,
    `[b]drawbox=x=9:y=173:w=628:h=355:color=0x34d399@0.8:t=2,drawbox=x=643:y=173:w=628:h=355:color=0x34d399@0.8:t=2,` +
      `${text('Consulta por videollamada', '(w-text_w)/2', 70, 40)},` +
      `${text('Cada una desde su casa o consultorio, sin instalar nada', '(w-text_w)/2', 122, 22, '0x94a3b8')},` +
      `${text('Vista de la paciente', '11+(624-text_w)/2', 548, 24, '0x34d399')},` +
      `${text('Vista de la médica', '645+(624-text_w)/2', 548, 24, '0x34d399')},` +
      `fps=${FPS},${fades(d)}[out]`,
  ].join(';');
  ffmpeg([
    '-ss', sec(patientStartMs), '-t', d.toFixed(3), '-i', patient,
    '-ss', sec(doctorStartMs), '-t', d.toFixed(3), '-i', doctor,
    '-filter_complex', graph, '-map', '[out]', ...ENCODE, out,
  ]);
  return out;
}

function transcode(input, out) {
  ffmpeg(['-i', input, '-vf', `${fit},fps=${FPS}`, ...ENCODE, '-movflags', '+faststart', out]);
  return out;
}

export async function compose() {
  const timeline = JSON.parse(await readFile(join(OUTPUT_DIR, 'timeline.json'), 'utf8'));
  const { patient, doctor, files } = timeline;
  if (!files?.patient || !files?.doctor) throw new Error('[compose] Missing raw recordings; run `npm run demo:record` first.');
  const required = [
    ['patient', ['waiting', 'callConnected', 'callEnd', 'rxStart', 'end']],
    ['doctor', ['callConnected', 'notes', 'callEnd', 'end']],
  ];
  for (const [role, marks] of required) {
    for (const m of marks) if (!timeline[role].marks[m]) throw new Error(`[compose] timeline is missing ${role}.${m}; the recording did not finish.`);
  }
  // Origins are taken just before each page (and its video) is created.
  const p = (name) => patient.marks[name] - patient.start;
  const d = (name) => doctor.marks[name] - doctor.start;

  await rm(TMP_DIR, { recursive: true, force: true });
  await mkdir(TMP_DIR, { recursive: true });

  console.log('[compose] paciente.mp4, medico.mp4');
  transcode(files.patient, join(OUTPUT_DIR, 'paciente.mp4'));
  transcode(files.doctor, join(OUTPUT_DIR, 'medico.mp4'));

  // Wall-clock marks are shared, so the call window maps onto both recordings.
  // The side-by-side shows the call itself; once the doctor starts writing
  // notes and the prescription, her full-screen view is easier to read.
  const callMs = Math.min(p('callEnd') - p('callConnected'), d('notes') - d('callConnected'));
  const parts = [
    clip(files.patient, 0, p('waiting'), join(TMP_DIR, '1-paciente.mp4')),
    clip(files.doctor, 0, d('callConnected'), join(TMP_DIR, '2-medico.mp4')),
    sideBySide(files.patient, files.doctor, p('callConnected'), d('callConnected'), callMs, join(TMP_DIR, '3-llamada.mp4')),
    clip(files.doctor, d('notes'), d('end'), join(TMP_DIR, '4-receta.mp4')),
    clip(files.patient, p('rxStart'), p('end'), join(TMP_DIR, '5-paciente-receta.mp4')),
  ];
  const list = join(TMP_DIR, 'concat.txt');
  await writeFile(list, parts.map((f) => `file '${f.replaceAll('\\', '/')}'`).join('\n'));
  console.log('[compose] consulta-completa.mp4');
  ffmpeg(['-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', '-movflags', '+faststart', join(OUTPUT_DIR, 'consulta-completa.mp4')]);
  await rm(TMP_DIR, { recursive: true, force: true });
  console.log(`[compose] done: ${OUTPUT_DIR}`);
}

if (isMainModule(import.meta.url)) {
  compose().catch((err) => {
    console.error(err.message || err);
    process.exit(1);
  });
}

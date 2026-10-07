// Converts the source clips into Chrome fake-capture inputs (.y4m + .wav).
// Chrome loops the .y4m file, so a ~16 s clip is enough for the whole call.
//
// Own clips: set DEMO_DOCTOR_CLIP / DEMO_PATIENT_CLIP to a local video path.
// They are center-cropped to 16:9. The stock doctor clip gets a tighter
// "webcam" crop around the person sitting at the desk.
import { execFileSync } from 'node:child_process';
import { readFile, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { CACHE_DIR, fetchMedia } from './fetch-media.mjs';
import { isMainModule } from './lib/local-env.mjs';

const WIDTH = 960;
const HEIGHT = 540;
const FPS = 20;
const SECONDS = 16;

// Stock clip 8375484 is 4096x2160 with the doctor centered: crop a 16:9 box
// around her head and shoulders so it reads like a laptop webcam.
const STOCK_DOCTOR_CROP = 'crop=1920:1080:1152:700';
const FILL_16_9 = `scale=${WIDTH}:${HEIGHT}:force_original_aspect_ratio=increase,crop=${WIDTH}:${HEIGHT}`;

function ffmpeg(args) {
  execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args], { stdio: 'inherit' });
}

// A sidecar stamp (source path + size + mtime + settings) decides whether a
// conversion is still valid, so swapping in another clip always re-converts.
async function stampFor(input, filter) {
  const s = await stat(input);
  return JSON.stringify({ input, size: s.size, mtime: s.mtimeMs, filter, WIDTH, HEIGHT, FPS, SECONDS });
}

async function isFresh(output, stamp) {
  try {
    const [o, previous] = await Promise.all([stat(output), readFile(`${output}.stamp`, 'utf8')]);
    return o.size > 0 && previous === stamp;
  } catch {
    return false;
  }
}

async function convert(role, input, preFilter) {
  const y4m = join(CACHE_DIR, `${role}.y4m`);
  const wav = join(CACHE_DIR, `${role}.wav`);
  const vf = [preFilter, FILL_16_9, `fps=${FPS}`, 'format=yuv420p'].filter(Boolean).join(',');
  const stamp = await stampFor(input, vf);
  if (!(await isFresh(y4m, stamp))) {
    console.log(`[media] ${role}: ${input} -> ${y4m}`);
    ffmpeg(['-ss', '0.5', '-t', String(SECONDS), '-i', input, '-an', '-vf', vf, '-f', 'yuv4mpegpipe', y4m]);
    await writeFile(`${y4m}.stamp`, stamp);
  }
  if (!(await isFresh(wav, String(SECONDS)))) {
    // Stock clips have no usable audio track: a silent mono track keeps the
    // fake microphone happy without producing noise in the recordings.
    ffmpeg(['-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=mono', '-t', String(SECONDS), '-c:a', 'pcm_s16le', wav]);
    await writeFile(`${wav}.stamp`, String(SECONDS));
  }
  return { y4m, wav };
}

export async function prepareMedia() {
  const customDoctor = process.env.DEMO_DOCTOR_CLIP;
  const customPatient = process.env.DEMO_PATIENT_CLIP;
  const stock = customDoctor && customPatient ? {} : await fetchMedia();
  return {
    doctor: await convert('doctor', customDoctor || stock.doctor, customDoctor ? '' : STOCK_DOCTOR_CROP),
    patient: await convert('patient', customPatient || stock.patient, ''),
  };
}

if (isMainModule(import.meta.url)) {
  prepareMedia()
    .then((out) => console.log(JSON.stringify(out, null, 2)))
    .catch((err) => {
      console.error(err.message);
      process.exit(1);
    });
}

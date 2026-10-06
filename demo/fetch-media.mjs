// Downloads the stock clips used as fake webcams into demo/.cache/.
// Clips: Pexels (free license, commercial use allowed). Files are treated as
// untrusted data: they are only read by ffmpeg, never executed.
import { mkdir, stat, writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isMainModule } from './lib/local-env.mjs';

const here = dirname(fileURLToPath(import.meta.url));
export const CACHE_DIR = join(here, '.cache');

export const CLIPS = {
  doctor: { id: '8375484', page: 'https://www.pexels.com/video/a-doctor-having-online-consultation-on-her-laptop-8375484/' },
  patient: { id: '7156550', page: 'https://www.pexels.com/video/pregnant-woman-on-a-video-call-7156550/' },
};

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36';

async function exists(path) {
  try {
    return (await stat(path)).size > 0;
  } catch {
    return false;
  }
}

export async function fetchMedia({ force = false } = {}) {
  await mkdir(CACHE_DIR, { recursive: true });
  const paths = {};
  for (const [role, clip] of Object.entries(CLIPS)) {
    const target = join(CACHE_DIR, `${clip.id}.mp4`);
    paths[role] = target;
    if (!force && (await exists(target))) {
      console.log(`[media] ${role}: cached ${target}`);
      continue;
    }
    const url = `https://www.pexels.com/download/video/${clip.id}/`;
    console.log(`[media] ${role}: downloading ${url}`);
    const res = await fetch(url, { headers: { 'User-Agent': UA }, redirect: 'follow' });
    const type = res.headers.get('content-type') || '';
    if (!res.ok || !type.startsWith('video/')) {
      throw new Error(`[media] Download failed for ${clip.id}: HTTP ${res.status} (${type}). Download it manually from ${clip.page} into ${target}.`);
    }
    await writeFile(target, Buffer.from(await res.arrayBuffer()));
  }
  return paths;
}

if (isMainModule(import.meta.url)) {
  fetchMedia({ force: process.argv.includes('--force') }).catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
}

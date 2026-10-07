// Starts a LOCAL LiveKit server in dev mode (devkey/secret, ws://127.0.0.1:7880)
// for the demo recorder. Uses `livekit-server` from PATH when available,
// otherwise a pinned release binary under demo/.cache/livekit/.
//
//   node demo/start-livekit.mjs            # start (downloads the binary if missing)
//   node demo/start-livekit.mjs --install  # only download/verify the binary
//
// The download is verified against the release's checksums.txt before use.
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { CACHE_DIR } from './fetch-media.mjs';
import { LIVEKIT, isMainModule } from './lib/local-env.mjs';

const VERSION = '1.13.8';
const RELEASE = `https://github.com/livekit/livekit/releases/download/v${VERSION}`;
const INSTALL_DIR = join(CACHE_DIR, 'livekit', VERSION);
const EXE = process.platform === 'win32' ? 'livekit-server.exe' : 'livekit-server';

function assetName() {
  const os = { win32: 'windows', darwin: 'darwin', linux: 'linux' }[process.platform];
  const arch = { x64: 'amd64', arm64: 'arm64' }[process.arch];
  if (!os || !arch) throw new Error(`[livekit] Unsupported platform ${process.platform}/${process.arch}.`);
  return `livekit_${VERSION}_${os}_${arch}.${os === 'windows' ? 'zip' : 'tar.gz'}`;
}

function onPath() {
  const probe = spawnSync('livekit-server', ['--version'], { encoding: 'utf8', shell: false });
  return probe.status === 0 ? 'livekit-server' : null;
}

async function exists(path) {
  try {
    return (await stat(path)).size > 0;
  } catch {
    return false;
  }
}

async function download(url) {
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok) throw new Error(`[livekit] Download failed: ${url} -> HTTP ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

export async function installLivekit() {
  const binary = join(INSTALL_DIR, EXE);
  if (await exists(binary)) return binary;

  const name = assetName();
  console.log(`[livekit] downloading ${name}`);
  const [archive, checksums] = await Promise.all([download(`${RELEASE}/${name}`), download(`${RELEASE}/checksums.txt`)]);
  const expected = checksums
    .toString('utf8')
    .split(/\r?\n/)
    .map((line) => line.trim().split(/\s+/))
    .find(([, file]) => file === name)?.[0];
  const actual = createHash('sha256').update(archive).digest('hex');
  if (!expected || expected !== actual) {
    throw new Error(`[livekit] Checksum mismatch for ${name} (expected ${expected || '<missing>'}, got ${actual}).`);
  }

  await mkdir(INSTALL_DIR, { recursive: true });
  const archivePath = join(INSTALL_DIR, name);
  await writeFile(archivePath, archive);
  // bsdtar (bundled with Windows 10+) extracts both .zip and .tar.gz. Call it
  // by full path: Git Bash puts GNU tar first, which cannot read zips and
  // treats "D:" as a remote host.
  const tar =
    process.platform === 'win32' ? join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'tar.exe') : 'tar';
  execFileSync(tar, ['-xf', name], { cwd: INSTALL_DIR, stdio: 'inherit' });
  if (!(await exists(binary))) throw new Error(`[livekit] ${EXE} not found after extracting ${name}.`);
  console.log(`[livekit] installed ${binary}`);
  return binary;
}

export async function resolveLivekitBinary() {
  return onPath() || installLivekit();
}

/** Spawns `livekit-server --dev` bound to localhost. Caller owns the process. */
export async function startLivekit({ stdio = 'inherit' } = {}) {
  const binary = await resolveLivekitBinary();
  const port = new URL(LIVEKIT.url).port;
  console.log(`[livekit] ${binary} --dev on ${LIVEKIT.url} (key ${LIVEKIT.apiKey})`);
  return spawn(binary, ['--dev', '--bind', '127.0.0.1', '--port', port], { stdio });
}

if (isMainModule(import.meta.url)) {
  const run = process.argv.includes('--install') ? installLivekit() : startLivekit();
  run
    .then((result) => {
      if (typeof result === 'string') return;
      result.on('exit', (code) => process.exit(code ?? 0));
      for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => result.kill(sig));
    })
    .catch((err) => {
      console.error(err.message);
      process.exit(1);
    });
}

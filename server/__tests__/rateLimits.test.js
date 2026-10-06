import { describe, it, expect, afterEach } from 'vitest';
import express from 'express';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import { ACTIVATE_ADHESION_RATE_LIMIT, createActivateAdhesionLimiter } from '../rateLimits.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const serverSource = () => readFileSync(resolve(__dirname, '..', '..', 'server.js'), 'utf-8');

let server;

/** Boots a throwaway app (same trust proxy as server.js) on an ephemeral port. */
async function startApp(limiter) {
  const app = express();
  app.set('trust proxy', 1);
  app.post('/api/adhesion/:id/activate', limiter, (req, res) => res.json({ ok: true }));
  await new Promise((done) => { server = app.listen(0, '127.0.0.1', done); });
  const { port } = server.address();
  return (ip) => fetch(`http://127.0.0.1:${port}/api/adhesion/x/activate`, {
    method: 'POST',
    headers: { 'X-Forwarded-For': ip },
  });
}

afterEach(async () => {
  if (server) await new Promise((done) => server.close(done));
  server = undefined;
});

describe('activate adhesion rate limit', () => {
  it('defaults to 10 requests per 15 minutes', () => {
    expect(ACTIVATE_ADHESION_RATE_LIMIT).toEqual({ windowMs: 15 * 60 * 1000, limit: 10 });
  });

  it('answers 429 with a Spanish JSON error once a client IP exceeds the limit', async () => {
    const post = await startApp(createActivateAdhesionLimiter({ limit: 2 }));

    expect((await post('203.0.113.7')).status).toBe(200);
    const second = await post('203.0.113.7');
    expect(second.status).toBe(200);
    expect(second.headers.get('ratelimit-policy') || second.headers.get('ratelimit')).toBeTruthy();
    expect(second.headers.get('x-ratelimit-limit')).toBeNull();

    const blocked = await post('203.0.113.7');
    expect(blocked.status).toBe(429);
    const body = await blocked.json();
    expect(body.error).toMatch(/Demasiados intentos/);
  });

  it('counts each forwarded client IP separately (trust proxy = 1 hop)', async () => {
    const post = await startApp(createActivateAdhesionLimiter({ limit: 1 }));

    expect((await post('203.0.113.7')).status).toBe(200);
    expect((await post('203.0.113.7')).status).toBe(429);
    expect((await post('198.51.100.9')).status).toBe(200);
  });
});

describe('server.js wiring (source)', () => {
  it('trusts exactly one proxy hop (Coolify/Traefik)', () => {
    expect(serverSource()).toMatch(/app\.set\(\s*['"]trust proxy['"]\s*,\s*1\s*\)/);
  });

  it('applies the limiter to POST /api/adhesion/:id/activate only', () => {
    const source = serverSource();
    expect(source).toMatch(/const\s+activateAdhesionLimiter\s*=\s*createActivateAdhesionLimiter\(\s*\)/);
    expect(source).toMatch(
      /app\.post\(\s*['"]\/api\/adhesion\/:id\/activate['"]\s*,\s*activateAdhesionLimiter\s*,\s*async\s*\(\s*req\s*,\s*res\s*\)/
    );
    expect(source.match(/activateAdhesionLimiter\b/g)).toHaveLength(2);
  });
});

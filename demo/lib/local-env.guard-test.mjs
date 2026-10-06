// Guard tests: the demo harness must never accept a non-local Supabase URL.
// Run with `node --test demo/lib/local-env.guard-test.mjs`.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { assertLocalUrl, buildAppEnv, isLocalUrl } from './local-env.mjs';
import { seedLocal } from '../seed-local.mjs';

const LOCAL = {
  apiUrl: 'http://127.0.0.1:54321',
  dbUrl: 'postgresql://postgres:postgres@127.0.0.1:54322/postgres',
  anonKey: 'anon',
  serviceRoleKey: 'service',
};

test('accepts loopback hosts', () => {
  for (const url of ['http://127.0.0.1:54321', 'http://localhost:54321', 'ws://127.0.0.1:7880', 'http://[::1]:54321']) {
    assert.equal(isLocalUrl(url), true, url);
  }
});

test('refuses remote, look-alike and malformed URLs', () => {
  for (const url of [
    'https://abcdefghijklmnop.supabase.co',
    'http://localhost.evil.example',
    'http://127.0.0.1@evil.example',
    'http://127.0.0.2:54321',
    'http://10.0.0.5:54321',
    '',
    undefined,
    'not a url',
  ]) {
    assert.equal(isLocalUrl(url), false, String(url));
    assert.throws(() => assertLocalUrl('test', url), /Refusing to run/);
  }
});

test('buildAppEnv refuses a remote Supabase URL', () => {
  assert.throws(() => buildAppEnv({ ...LOCAL, apiUrl: 'https://x.supabase.co' }), /Refusing to run/);
  assert.equal(buildAppEnv(LOCAL).VITE_SUPABASE_URL, LOCAL.apiUrl);
});

test('seedLocal refuses remote API or DB URLs before connecting', async () => {
  await assert.rejects(seedLocal({ ...LOCAL, apiUrl: 'https://x.supabase.co' }), /Refusing to run/);
  await assert.rejects(
    seedLocal({ ...LOCAL, dbUrl: 'postgresql://postgres:pw@db.x.supabase.co:5432/postgres' }),
    /Refusing to run/
  );
});

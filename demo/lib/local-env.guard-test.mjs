// Guard tests: the demo harness must never accept a non-local Supabase URL.
// Run with `node --test demo/lib/local-env.guard-test.mjs`.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { assertLocalDbUrl, assertLocalUrl, buildAppEnv, isLocalUrl } from './local-env.mjs';
import { expectOneRow, seedLocal, slotsAround } from '../seed-local.mjs';

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

test('buildAppEnv refuses a remote database URL', () => {
  assert.throws(
    () => buildAppEnv({ ...LOCAL, dbUrl: 'postgresql://postgres:pw@db.x.supabase.co:5432/postgres' }),
    /Refusing to run/
  );
  assert.equal(buildAppEnv(LOCAL).DATABASE_URL, LOCAL.dbUrl);
});

test('assertLocalDbUrl accepts only loopback postgres URLs', () => {
  assert.doesNotThrow(() => assertLocalDbUrl('db', LOCAL.dbUrl));
  assert.doesNotThrow(() => assertLocalDbUrl('db', 'postgres://postgres:postgres@localhost:54322/postgres'));
  for (const url of ['postgresql://u:p@db.x.supabase.co:5432/postgres', 'postgresql://u:p@127.0.0.1@evil.example/db', '', undefined]) {
    assert.throws(() => assertLocalDbUrl('db', url), /Refusing to run/, String(url));
  }
});

test('seedLocal refuses remote API or DB URLs before connecting', async () => {
  await assert.rejects(seedLocal({ ...LOCAL, apiUrl: 'https://x.supabase.co' }), /Refusing to run/);
  await assert.rejects(
    seedLocal({ ...LOCAL, dbUrl: 'postgresql://postgres:pw@db.x.supabase.co:5432/postgres' }),
    /Refusing to run/
  );
});

test('expectOneRow accepts exactly one updated row', () => {
  assert.doesNotThrow(() => expectOneRow({ rowCount: 1 }, 'doctor'));
  for (const rowCount of [0, 2, undefined]) {
    assert.throws(() => expectOneRow({ rowCount }, 'doctor'), /Expected to update 1 doctor profile/, String(rowCount));
  }
});

test('slotsAround offers a short window that includes the current hour', () => {
  assert.deepEqual(slotsAround(new Date(2026, 9, 6, 14, 35)), ['13:00', '14:00', '15:00', '16:00', '17:00', '18:00']);
  // Near midnight the window wraps and stays sorted for the booking grid.
  assert.deepEqual(slotsAround(new Date(2026, 9, 6, 23, 10)), ['00:00', '01:00', '02:00', '03:00', '22:00', '23:00']);
  assert.deepEqual(slotsAround(new Date(2026, 9, 6, 0, 5)), ['00:00', '01:00', '02:00', '03:00', '04:00', '23:00']);
});

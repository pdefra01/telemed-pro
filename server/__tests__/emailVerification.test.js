import { describe, it, expect } from 'vitest';
import {
  normalizeEmail,
  isEmailVerificationRequired,
  generateOtpCode,
  isEmailVerified,
  VERIFIED_EMAIL_MAX_AGE_MS,
} from '../emailVerification.js';

/**
 * Chainable stub for supabaseAdmin.from('contact_verifications').select()...
 * Records every filter so the test can assert the query shape, and resolves
 * to `result` when awaited (via .limit()).
 */
function createDb(result = { data: [], error: null }) {
  const query = { table: null, eq: {}, not: [], gte: {}, order: null, limit: null };
  const builder = {
    select: () => builder,
    eq: (c, v) => { query.eq[c] = v; return builder; },
    not: (c, op, v) => { query.not.push([c, op, v]); return builder; },
    gte: (c, v) => { query.gte[c] = v; return builder; },
    order: (c, o) => { query.order = [c, o]; return builder; },
    limit: async (n) => { query.limit = n; return result; },
  };
  return {
    query,
    supabaseAdmin: { from: (table) => { query.table = table; return builder; } },
  };
}

describe('normalizeEmail', () => {
  it('trims and lowercases, matching how /api/email-verification/send stores it', () => {
    expect(normalizeEmail('  Juan.Perez@Test.COM \n')).toBe('juan.perez@test.com');
  });

  it('returns an empty string for null/undefined/non-strings', () => {
    expect(normalizeEmail(null)).toBe('');
    expect(normalizeEmail(undefined)).toBe('');
    expect(normalizeEmail(42)).toBe('');
  });
});

describe('isEmailVerificationRequired', () => {
  it('defaults to true when the env var is unset', () => {
    expect(isEmailVerificationRequired({})).toBe(true);
  });

  it.each(['false', 'FALSE', ' false '])('is false only when explicitly %j', (value) => {
    expect(isEmailVerificationRequired({ EMAIL_VERIFICATION_REQUIRED: value })).toBe(false);
  });

  it.each(['true', '', '0', 'no'])('stays true for %j', (value) => {
    expect(isEmailVerificationRequired({ EMAIL_VERIFICATION_REQUIRED: value })).toBe(true);
  });
});

describe('generateOtpCode', () => {
  it('returns a 6-digit numeric string', () => {
    for (let i = 0; i < 200; i += 1) {
      expect(generateOtpCode()).toMatch(/^[1-9]\d{5}$/);
    }
  });
});

describe('isEmailVerified', () => {
  const NOW = Date.parse('2026-10-06T12:00:00.000Z');

  it('returns true when a verified email challenge exists within the max age', async () => {
    const { supabaseAdmin, query } = createDb({ data: [{ id: 'cv-1' }], error: null });

    await expect(isEmailVerified(supabaseAdmin, ' Juan@Test.com ', { now: NOW })).resolves.toBe(true);

    expect(query.table).toBe('contact_verifications');
    expect(query.eq).toEqual({ channel: 'email', contact_value: 'juan@test.com' });
    expect(query.not).toEqual([['verified_at', 'is', null]]);
    expect(query.gte).toEqual({
      verified_at: new Date(NOW - VERIFIED_EMAIL_MAX_AGE_MS).toISOString(),
    });
    expect(query.limit).toBe(1);
  });

  it('honours a custom max age', async () => {
    const { supabaseAdmin, query } = createDb({ data: [{ id: 'cv-1' }], error: null });

    await isEmailVerified(supabaseAdmin, 'juan@test.com', { now: NOW, maxAgeMs: 60_000 });

    expect(query.gte.verified_at).toBe(new Date(NOW - 60_000).toISOString());
  });

  it('returns false when no verified challenge exists', async () => {
    const { supabaseAdmin } = createDb({ data: [], error: null });
    await expect(isEmailVerified(supabaseAdmin, 'juan@test.com', { now: NOW })).resolves.toBe(false);
  });

  it('returns false without querying when the email is blank', async () => {
    const { supabaseAdmin, query } = createDb({ data: [{ id: 'cv-1' }], error: null });
    await expect(isEmailVerified(supabaseAdmin, '   ')).resolves.toBe(false);
    expect(query.table).toBeNull();
  });

  it('throws on a database error so callers answer 500 instead of "unverified"', async () => {
    const { supabaseAdmin } = createDb({ data: null, error: { message: 'boom' } });
    await expect(isEmailVerified(supabaseAdmin, 'juan@test.com', { now: NOW })).rejects.toThrow('boom');
  });
});

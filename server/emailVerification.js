// server/emailVerification.js
//
// Server-side email verification helpers for the public adhesion flow. The
// browser-supplied `adhesion_requests.email_verified` flag is never trusted:
// callers check `contact_verifications` (written by the OTP endpoints in
// server.js) through `isEmailVerified`.

import crypto from 'node:crypto';

/**
 * How long a verified OTP keeps proving ownership of an email. Measured from
 * `verified_at`, independent of the OTP's own `expires_at` (which only bounds
 * how long the code can be typed in).
 */
export const VERIFIED_EMAIL_MAX_AGE_MS = 24 * 60 * 60 * 1000;

/** Canonical form used to store and look up emails in contact_verifications. */
export function normalizeEmail(email) {
  if (typeof email !== 'string') return '';
  return email.trim().toLowerCase();
}

/**
 * Email verification is ON unless EMAIL_VERIFICATION_REQUIRED is explicitly
 * 'false' (case/whitespace-insensitive). Any other value keeps it on.
 */
export function isEmailVerificationRequired(env = process.env) {
  const raw = env?.EMAIL_VERIFICATION_REQUIRED;
  if (typeof raw !== 'string') return true;
  return raw.trim().toLowerCase() !== 'false';
}

/** Six-digit OTP from a CSPRNG (never Math.random). */
export function generateOtpCode() {
  return crypto.randomInt(100000, 1000000).toString();
}

/**
 * True when `contact_verifications` holds an email challenge for `email` that
 * was verified within `maxAgeMs`. Throws on a database error so callers can
 * answer 500 instead of treating the email as unverified.
 *
 * @param {object} supabaseAdmin service-role client
 * @param {string} email
 * @param {{ now?: number, maxAgeMs?: number }} [options]
 * @returns {Promise<boolean>}
 */
export async function isEmailVerified(supabaseAdmin, email, { now = Date.now(), maxAgeMs = VERIFIED_EMAIL_MAX_AGE_MS } = {}) {
  const cleanEmail = normalizeEmail(email);
  if (!cleanEmail) return false;

  const { data, error } = await supabaseAdmin
    .from('contact_verifications')
    .select('id')
    .eq('channel', 'email')
    .eq('contact_value', cleanEmail)
    .not('verified_at', 'is', null)
    .gte('verified_at', new Date(now - maxAgeMs).toISOString())
    .order('verified_at', { ascending: false })
    .limit(1);

  if (error) {
    throw new Error(`contact_verifications lookup failed: ${error.message}`);
  }
  return Array.isArray(data) && data.length > 0;
}

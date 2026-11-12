import { describe, it, expect } from 'vitest';
import {
  DEFAULT_MAX_SESSION_HOURS,
  DEFAULT_SESSION_POLICY,
  getSessionExpiryReason,
  resolveMaxSessionHours,
  resolvePersistentSession,
  resolveTimeoutMinutes,
} from '../sessionExpiry';

const NOW = new Date('2026-10-24T20:00:00.000Z').getTime();
const minutesAgo = (m: number) => NOW - m * 60 * 1000;
const hoursAgo = (h: number) => minutesAgo(h * 60);

describe('getSessionExpiryReason', () => {
  it('keeps a session that is within both limits', () => {
    expect(
      getSessionExpiryReason({ now: NOW, startedAt: hoursAgo(2), lastActivityAt: minutesAgo(5), timeoutMinutes: 30, maxSessionHours: 8 })
    ).toBeNull();
  });

  it('expires by inactivity once the last activity is older than the timeout', () => {
    expect(
      getSessionExpiryReason({ now: NOW, startedAt: hoursAgo(2), lastActivityAt: minutesAgo(31), timeoutMinutes: 30, maxSessionHours: 8 })
    ).toBe('inactivity');
  });

  it('measures inactivity by wall clock, so a computer that slept overnight is expired on wake', () => {
    expect(
      getSessionExpiryReason({ now: NOW, startedAt: hoursAgo(14), lastActivityAt: hoursAgo(13), timeoutMinutes: 30, maxSessionHours: 0 })
    ).toBe('inactivity');
  });

  it('expires by max duration after 8 hours even with constant activity', () => {
    expect(
      getSessionExpiryReason({ now: NOW, startedAt: hoursAgo(8) - 1, lastActivityAt: NOW, timeoutMinutes: 30, maxSessionHours: 8 })
    ).toBe('max_duration');
  });

  it('keeps a session right before the 8 hour limit', () => {
    expect(
      getSessionExpiryReason({ now: NOW, startedAt: hoursAgo(8) + 1000, lastActivityAt: NOW, timeoutMinutes: 30, maxSessionHours: 8 })
    ).toBeNull();
  });

  it('reports max duration first when both limits are exceeded', () => {
    expect(
      getSessionExpiryReason({ now: NOW, startedAt: hoursAgo(20), lastActivityAt: hoursAgo(19), timeoutMinutes: 30, maxSessionHours: 8 })
    ).toBe('max_duration');
  });

  it('treats 0 as disabled for both limits (patients)', () => {
    expect(
      getSessionExpiryReason({ now: NOW, startedAt: hoursAgo(500), lastActivityAt: hoursAgo(400), timeoutMinutes: 0, maxSessionHours: 0 })
    ).toBeNull();
  });

  it('does not expire when a timestamp is missing', () => {
    expect(
      getSessionExpiryReason({ now: NOW, startedAt: null, lastActivityAt: null, timeoutMinutes: 30, maxSessionHours: 8 })
    ).toBeNull();
  });
});

describe('resolveMaxSessionHours', () => {
  it('defaults doctors to 8 hours when the stored policy predates the field', () => {
    expect(DEFAULT_MAX_SESSION_HOURS.doctor).toBe(8);
    expect(resolveMaxSessionHours({ doctor: { timeoutMinutes: 30, persistent: false } }, 'doctor')).toBe(8);
  });

  it('uses the stored value when present, including 0', () => {
    expect(resolveMaxSessionHours({ doctor: { timeoutMinutes: 30, persistent: false, maxSessionHours: 12 } }, 'doctor')).toBe(12);
    expect(resolveMaxSessionHours({ doctor: { timeoutMinutes: 30, persistent: false, maxSessionHours: 0 } }, 'doctor')).toBe(0);
  });

  it('has no limit for the other roles unless configured', () => {
    expect(resolveMaxSessionHours({}, 'admin')).toBe(0);
    expect(resolveMaxSessionHours(null, 'patient')).toBe(0);
  });
});

describe('session policy defaults per role', () => {
  it('covers supervisors like advisors: an inactivity timeout and a non-persistent session', () => {
    expect(DEFAULT_SESSION_POLICY.supervisor).toEqual({ timeoutMinutes: 15, persistent: false });
    expect(Object.keys(DEFAULT_SESSION_POLICY).sort()).toEqual(['admin', 'advisor', 'doctor', 'patient', 'supervisor']);
  });

  it('falls back to the role default when a cached policy lacks the role, never 0 for a staff role', () => {
    const cachedBeforeSupervisors = { admin: { timeoutMinutes: 15, persistent: false }, patient: { timeoutMinutes: 0, persistent: true } };
    expect(resolveTimeoutMinutes(cachedBeforeSupervisors, 'supervisor')).toBe(15);
    expect(resolvePersistentSession(cachedBeforeSupervisors, 'supervisor')).toBe(false);
    expect(resolveTimeoutMinutes(null, 'supervisor')).toBe(15);
    expect(resolvePersistentSession(null, 'supervisor')).toBe(false);
  });

  it('keeps the stored values, including a timeout of 0 set by the admin', () => {
    const policy = { advisor: { timeoutMinutes: 0, persistent: true }, supervisor: { timeoutMinutes: 45, persistent: false } };
    expect(resolveTimeoutMinutes(policy, 'advisor')).toBe(0);
    expect(resolvePersistentSession(policy, 'advisor')).toBe(true);
    expect(resolveTimeoutMinutes(policy, 'supervisor')).toBe(45);
  });

  it('keeps patients and unknown roles persistent without a timeout, as before', () => {
    expect(resolveTimeoutMinutes({}, 'patient')).toBe(0);
    expect(resolvePersistentSession({}, 'patient')).toBe(true);
    expect(resolveTimeoutMinutes({}, 'someone')).toBe(0);
    expect(resolvePersistentSession({}, 'someone')).toBe(true);
  });
});

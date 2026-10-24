// Session expiry rules, measured by wall clock (Date.now) rather than by a
// relative setTimeout: a timer pauses while the computer sleeps or the browser
// throttles the tab, so on a shared office computer the session never expired.

export type SessionExpiryReason = 'inactivity' | 'max_duration';

type RolePolicy = { timeoutMinutes?: number; persistent?: boolean; maxSessionHours?: number };
type SessionPolicy = Record<string, RolePolicy | undefined> | null | undefined;

/**
 * Absolute session length per role, applied when the stored policy predates
 * the `maxSessionHours` field. Doctors share office computers.
 */
export const DEFAULT_MAX_SESSION_HOURS: Record<string, number> = {
  doctor: 8,
};

export function resolveMaxSessionHours(policy: SessionPolicy, role: string): number {
  const stored = policy?.[role]?.maxSessionHours;
  if (typeof stored === 'number' && stored >= 0) return stored;
  return DEFAULT_MAX_SESSION_HOURS[role] ?? 0;
}

/**
 * Returns why the session must end, or null while it is still valid.
 * A limit of 0 disables it; a missing timestamp never expires the session.
 */
export function getSessionExpiryReason({
  now,
  startedAt,
  lastActivityAt,
  timeoutMinutes,
  maxSessionHours,
}: {
  now: number;
  startedAt: number | null;
  lastActivityAt: number | null;
  timeoutMinutes: number;
  maxSessionHours: number;
}): SessionExpiryReason | null {
  if (maxSessionHours > 0 && startedAt !== null && now - startedAt >= maxSessionHours * 60 * 60 * 1000) {
    return 'max_duration';
  }
  if (timeoutMinutes > 0 && lastActivityAt !== null && now - lastActivityAt >= timeoutMinutes * 60 * 1000) {
    return 'inactivity';
  }
  return null;
}

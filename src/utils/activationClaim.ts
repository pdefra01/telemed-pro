/**
 * Client-side mirror of the server's stale-claim rule
 * (`isActivationClaimStale` / `STALE_CLAIM_THRESHOLD_MS` in
 * server/adhesionActivationRecovery.js). Keep both thresholds in sync: the
 * server is authoritative and refuses a release while the claim is fresh.
 */
export const ACTIVATION_CLAIM_STALE_MS = 10 * 60 * 1000;

/**
 * - `none`: no activation claim (or the row is not pending).
 * - `fresh`: an activation is running; approving would be refused.
 * - `stale`: the activation crashed or hung; an admin can release it.
 */
export type ActivationClaimState = 'none' | 'fresh' | 'stale';

export function getActivationClaimState(
  row: { status?: string; activation_claimed_at?: string | null } | null | undefined,
  now: Date = new Date(),
  thresholdMs: number = ACTIVATION_CLAIM_STALE_MS,
): ActivationClaimState {
  if (!row || row.status !== 'pending' || !row.activation_claimed_at) return 'none';
  const claimedAt = Date.parse(row.activation_claimed_at);
  if (Number.isNaN(claimedAt)) return 'none';
  return now.getTime() - claimedAt >= thresholdMs ? 'stale' : 'fresh';
}

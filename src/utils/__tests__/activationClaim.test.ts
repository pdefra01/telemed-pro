import { describe, it, expect } from 'vitest';
import { ACTIVATION_CLAIM_STALE_MS, getActivationClaimState } from '../activationClaim';

const NOW = new Date('2026-10-06T12:00:00.000Z');
const minutesAgo = (m: number) => new Date(NOW.getTime() - m * 60 * 1000).toISOString();

describe('getActivationClaimState (mirrors server isActivationClaimStale)', () => {
  it('uses the same 10 minute threshold as the server', () => {
    expect(ACTIVATION_CLAIM_STALE_MS).toBe(10 * 60 * 1000);
  });

  it('is none without a claim', () => {
    expect(getActivationClaimState({ status: 'pending', activation_claimed_at: null }, NOW)).toBe('none');
    expect(getActivationClaimState({ status: 'pending' }, NOW)).toBe('none');
  });

  it('is none for a row that is not pending', () => {
    expect(getActivationClaimState({ status: 'approved', activation_claimed_at: minutesAgo(30) }, NOW)).toBe('none');
  });

  it('is none for an unparseable timestamp', () => {
    expect(getActivationClaimState({ status: 'pending', activation_claimed_at: 'not-a-date' }, NOW)).toBe('none');
  });

  it('is fresh while the claim is younger than the threshold', () => {
    expect(getActivationClaimState({ status: 'pending', activation_claimed_at: minutesAgo(9) }, NOW)).toBe('fresh');
  });

  it('is stale at and after the threshold', () => {
    expect(getActivationClaimState({ status: 'pending', activation_claimed_at: minutesAgo(10) }, NOW)).toBe('stale');
    expect(getActivationClaimState({ status: 'pending', activation_claimed_at: minutesAgo(45) }, NOW)).toBe('stale');
  });
});

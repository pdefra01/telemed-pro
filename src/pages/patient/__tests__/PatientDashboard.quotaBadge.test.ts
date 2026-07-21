import { describe, it, expect } from 'vitest';
import { getQuotaBadgeContent } from '../PatientDashboard';

describe('getQuotaBadgeContent', () => {
  it('shows an explicit "no plan" label without any fabricated number', () => {
    const badge = getQuotaBadgeContent({
      quotaUsed: 1,
      totalBonified: 0,
      remaining: 0,
      isUnlimited: false,
      hasPlan: false,
      isOverQuota: false,
      planName: 'Sin plan asignado',
    });

    expect(badge.label).toBe('Sin plan asignado');
    expect(badge.label).not.toMatch(/\d\/\d/);
  });

  it('shows an infinity symbol instead of a numeric cap for unlimited plans', () => {
    const badge = getQuotaBadgeContent({
      quotaUsed: 12,
      totalBonified: null,
      remaining: null,
      isUnlimited: true,
      hasPlan: true,
      isOverQuota: false,
      planName: 'Plan Ilimitado',
    });

    expect(badge.label).toBe('Consultas Bonificadas: 12/∞');
  });

  it('shows the amber over-quota warning for a finite plan at its cap', () => {
    const badge = getQuotaBadgeContent({
      quotaUsed: 6,
      totalBonified: 6,
      remaining: 0,
      isUnlimited: false,
      hasPlan: true,
      isOverQuota: true,
      planName: 'Plan Familiar Medinex',
    });

    expect(badge.label).toBe('⚠️ Cupo Mensual Cubierto (6/6)');
    expect(badge.className).toContain('amber');
  });

  it('shows the normal teal usage label for a finite plan under its cap', () => {
    const badge = getQuotaBadgeContent({
      quotaUsed: 2,
      totalBonified: 6,
      remaining: 4,
      isUnlimited: false,
      hasPlan: true,
      isOverQuota: false,
      planName: 'Plan Familiar Medinex',
    });

    expect(badge.label).toBe('Consultas Bonificadas: 2/6');
    expect(badge.className).toContain('teal');
  });
});

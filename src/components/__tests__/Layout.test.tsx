import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import Layout from '../Layout';
import { Role, User } from '../../types';
import { commissionRepository } from '../../repositories/CommissionRepository';

vi.mock('../../repositories/CommissionRepository', () => ({
  commissionRepository: { isVisible: vi.fn() },
}));

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(commissionRepository.isVisible).mockResolvedValue(true);
});

const renderAs = (role: Role) => {
  const user: User = { id: 'u-1', name: 'Test', email: 'test@test.local', role };
  render(
    <MemoryRouter>
      <Layout user={user} onLogout={() => {}}>
        <div />
      </Layout>
    </MemoryRouter>
  );
};

const hrefs = () => screen.getAllByRole('link').map((a) => a.getAttribute('href'));

describe('Layout navigation by role (commercial CRM)', () => {
  it('gives the advisor a prospects entry and a collections entry', () => {
    renderAs('advisor');
    expect(hrefs()).toContain('/prospects');
    expect(hrefs()).toContain('/collections');
  });

  it('does not show the advisor collections entry to patients', () => {
    renderAs('patient');
    expect(hrefs()).not.toContain('/collections');
  });

  it('gives the supervisor their team, its goals and metrics, and its collections', () => {
    renderAs('supervisor');
    expect(hrefs()).toContain('/');
    expect(hrefs()).toContain('/team/performance');
    expect(hrefs()).toContain('/team/collections');
    expect(hrefs()).not.toContain('/prospects');
    expect(hrefs()).not.toContain('/affiliates');
    expect(hrefs()).not.toContain('/admin/producers');
  });

  it('gives the admin the commercial prospects overview and keeps the advisors screen', () => {
    renderAs('admin');
    expect(hrefs()).toContain('/admin/prospects');
    expect(hrefs()).toContain('/admin/supervisors');
    expect(hrefs()).toContain('/team/collections');
    expect(hrefs()).toContain('/team/performance');
    expect(hrefs()).toContain('/admin/producers');
  });

  it('does not show the commercial entries to patients', () => {
    renderAs('patient');
    expect(hrefs()).not.toContain('/prospects');
    expect(hrefs()).not.toContain('/admin/prospects');
    expect(hrefs()).not.toContain('/team/performance');
  });

  it('does not show the team goals and metrics to advisors', () => {
    renderAs('advisor');
    expect(hrefs()).not.toContain('/team/performance');
  });
  it('gives each commercial role its commissions entry', async () => {
    renderAs('advisor');
    expect(await screen.findByRole('link', { name: /comisiones/i })).toHaveAttribute('href', '/commissions');
    expect(hrefs()).not.toContain('/team/commissions');
    expect(hrefs()).not.toContain('/admin/commissions');
  });

  it('gives the supervisor the team commissions', async () => {
    renderAs('supervisor');
    expect(await screen.findByRole('link', { name: /comisiones del equipo/i })).toHaveAttribute('href', '/team/commissions');
    expect(hrefs()).not.toContain('/admin/commissions');
  });

  it('gives the admin the commission liquidations whatever the switch says', () => {
    vi.mocked(commissionRepository.isVisible).mockResolvedValue(false);
    renderAs('admin');
    expect(hrefs()).toContain('/admin/commissions');
    expect(hrefs()).not.toContain('/commissions');
    expect(commissionRepository.isVisible).not.toHaveBeenCalled();
  });

  it('hides the advisor commissions entry while the switch is off', async () => {
    vi.mocked(commissionRepository.isVisible).mockResolvedValue(false);
    renderAs('advisor');
    await waitFor(() => expect(commissionRepository.isVisible).toHaveBeenCalled());
    expect(hrefs()).toContain('/prospects');
    expect(hrefs()).not.toContain('/commissions');
  });

  it('hides the team commissions entry from the supervisor while the switch is off', async () => {
    vi.mocked(commissionRepository.isVisible).mockResolvedValue(false);
    renderAs('supervisor');
    await waitFor(() => expect(commissionRepository.isVisible).toHaveBeenCalled());
    expect(hrefs()).toContain('/team/performance');
    expect(hrefs()).not.toContain('/team/commissions');
  });

  it('hides the commissions entry when the switch cannot be read', async () => {
    vi.mocked(commissionRepository.isVisible).mockRejectedValue(new Error('network'));
    renderAs('advisor');
    await waitFor(() => expect(commissionRepository.isVisible).toHaveBeenCalled());
    expect(hrefs()).not.toContain('/commissions');
  });

  it('does not show commissions to patients', () => {
    renderAs('patient');
    expect(hrefs().some((h) => (h ?? '').includes('commissions'))).toBe(false);
  });
});

describe('Layout navigation for an advisor with a plan', () => {
  const renderAdvisor = (planId?: string) => {
    const user: User = { id: 'u-1', name: 'Test', email: 'test@test.local', role: 'advisor', planId };
    render(
      <MemoryRouter>
        <Layout user={user} onLogout={() => {}}>
          <div />
        </Layout>
      </MemoryRouter>
    );
  };

  it('adds the affiliate entries next to the commercial ones', () => {
    renderAdvisor('plan-1');
    expect(hrefs()).toEqual(expect.arrayContaining(['/prospects', '/collections', '/pharmacy', '/history', '/payments']));
  });

  it('keeps the affiliate entries away from an advisor without a plan', () => {
    renderAdvisor();
    expect(hrefs()).not.toContain('/pharmacy');
    expect(hrefs()).not.toContain('/history');
    expect(hrefs()).not.toContain('/payments');
  });
});

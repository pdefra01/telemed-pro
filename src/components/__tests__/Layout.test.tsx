import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect } from 'vitest';
import Layout from '../Layout';
import { Role, User } from '../../types';

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
  it('gives each commercial role its commissions entry', () => {
    renderAs('advisor');
    expect(hrefs()).toContain('/commissions');
    expect(hrefs()).not.toContain('/team/commissions');
    expect(hrefs()).not.toContain('/admin/commissions');
  });

  it('gives the supervisor the team commissions', () => {
    renderAs('supervisor');
    expect(hrefs()).toContain('/team/commissions');
    expect(hrefs()).not.toContain('/admin/commissions');
  });

  it('gives the admin the commission liquidations', () => {
    renderAs('admin');
    expect(hrefs()).toContain('/admin/commissions');
    expect(hrefs()).not.toContain('/commissions');
  });

  it('does not show commissions to patients', () => {
    renderAs('patient');
    expect(hrefs().some((h) => (h ?? '').includes('commissions'))).toBe(false);
  });
});

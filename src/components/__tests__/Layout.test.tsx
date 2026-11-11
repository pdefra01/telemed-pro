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
  it('gives the advisor a prospects entry', () => {
    renderAs('advisor');
    expect(hrefs()).toContain('/prospects');
  });

  it('gives the supervisor only their team entry', () => {
    renderAs('supervisor');
    expect(hrefs()).toContain('/');
    expect(hrefs()).not.toContain('/prospects');
    expect(hrefs()).not.toContain('/affiliates');
    expect(hrefs()).not.toContain('/admin/producers');
  });

  it('gives the admin the commercial prospects overview and keeps the advisors screen', () => {
    renderAs('admin');
    expect(hrefs()).toContain('/admin/prospects');
    expect(hrefs()).toContain('/admin/supervisors');
    expect(hrefs()).toContain('/admin/producers');
  });

  it('does not show the commercial entries to patients', () => {
    renderAs('patient');
    expect(hrefs()).not.toContain('/prospects');
    expect(hrefs()).not.toContain('/admin/prospects');
  });
});

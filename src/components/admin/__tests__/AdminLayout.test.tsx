import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import AdminLayout from '../AdminLayout';
import { User } from '../../../types';

const admin = { id: 'admin-1', name: 'admin', email: 'admin@test.com', role: 'admin' } as User;

const renderMenu = () =>
  render(
    <MemoryRouter>
      <AdminLayout user={admin} onLogout={() => {}}>
        <div />
      </AdminLayout>
    </MemoryRouter>
  );

const linkTo = (name: string) => screen.getByRole('link', { name: new RegExp(`^${name}$`) });

describe('AdminLayout menu', () => {
  it('links the commercial (CRM) screens the admin can open', () => {
    renderMenu();
    expect(linkTo('Supervisores')).toHaveAttribute('href', '/admin/supervisors');
    expect(linkTo('Prospectos')).toHaveAttribute('href', '/admin/prospects');
    expect(linkTo('Metas y métricas')).toHaveAttribute('href', '/team/performance');
    expect(linkTo('Cobranzas comerciales')).toHaveAttribute('href', '/team/collections');
    expect(linkTo('Comisiones')).toHaveAttribute('href', '/admin/commissions');
  });

  it('keeps the existing entries', () => {
    renderMenu();
    for (const [name, href] of [
      ['Afiliados', '/affiliates'],
      ['Asesores Comerciales', '/admin/producers'],
      ['Convenios', '/agreements'],
      ['Facturación', '/billing'],
      ['Configuración', '/settings'],
    ]) {
      expect(linkTo(name)).toHaveAttribute('href', href);
    }
  });
});

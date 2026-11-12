import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, it, expect } from 'vitest';
import { ProtectedRoute } from '../ProtectedRoute';
import { Role, User } from '../../types';

const renderAt = (user: User | null, guard: { allowedRoles?: Role[]; affiliateOnly?: boolean }) => {
  render(
    <MemoryRouter initialEntries={['/history']}>
      <Routes>
        <Route path="/" element={<div>home</div>} />
        <Route path="/login" element={<div>login</div>} />
        <Route
          path="/history"
          element={
            <ProtectedRoute user={user} {...guard}>
              <div>affiliate page</div>
            </ProtectedRoute>
          }
        />
      </Routes>
    </MemoryRouter>
  );
};

const user = (role: Role, planId?: string): User => ({ id: 'u-1', name: 'Test', email: 't@test.local', role, planId });

describe('ProtectedRoute affiliateOnly', () => {
  it('lets a patient in', () => {
    renderAt(user('patient'), { affiliateOnly: true });
    expect(screen.getByText('affiliate page')).toBeInTheDocument();
  });

  it('lets an advisor with a plan in', () => {
    renderAt(user('advisor', 'plan-1'), { affiliateOnly: true });
    expect(screen.getByText('affiliate page')).toBeInTheDocument();
  });

  it('sends an advisor without a plan home', () => {
    renderAt(user('advisor'), { affiliateOnly: true });
    expect(screen.getByText('home')).toBeInTheDocument();
  });

  it('sends a doctor home', () => {
    renderAt(user('doctor'), { affiliateOnly: true });
    expect(screen.getByText('home')).toBeInTheDocument();
  });

  it('sends a visitor to the login', () => {
    renderAt(null, { affiliateOnly: true });
    expect(screen.getByText('login')).toBeInTheDocument();
  });
});

describe('ProtectedRoute allowedRoles (unchanged)', () => {
  it('still filters by role', () => {
    renderAt(user('advisor', 'plan-1'), { allowedRoles: ['admin'] });
    expect(screen.getByText('home')).toBeInTheDocument();
  });

  it('still lets a listed role in', () => {
    renderAt(user('admin'), { allowedRoles: ['admin'] });
    expect(screen.getByText('affiliate page')).toBeInTheDocument();
  });
});

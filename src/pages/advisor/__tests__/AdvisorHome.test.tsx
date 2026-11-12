import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AdvisorHome } from '../AdvisorHome';
import { User } from '../../../types';

vi.mock('../AdvisorDashboard', () => ({ AdvisorDashboard: () => <div>commercial dashboard</div> }));
vi.mock('../../patient/PatientDashboard', () => ({ default: () => <div>affiliate dashboard</div> }));

const advisor = (planId?: string): User => ({ id: 'u-1', name: 'Test', email: 't@test.local', role: 'advisor', planId });

beforeEach(() => {
  try { localStorage.clear(); } catch { /* storage unavailable */ }
});

describe('AdvisorHome', () => {
  it('shows only the commercial dashboard to an advisor without a plan', () => {
    render(<AdvisorHome user={advisor()} />);
    expect(screen.getByText('commercial dashboard')).toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: 'Mi plan' })).not.toBeInTheDocument();
  });

  it('opens on the commercial view for an advisor with a plan', () => {
    render(<AdvisorHome user={advisor('plan-1')} />);
    expect(screen.getByRole('tab', { name: 'Comercial' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText('commercial dashboard')).toBeInTheDocument();
  });

  it('switches to the plan view and back', () => {
    render(<AdvisorHome user={advisor('plan-1')} />);
    fireEvent.click(screen.getByRole('tab', { name: 'Mi plan' }));
    expect(screen.getByText('affiliate dashboard')).toBeInTheDocument();
    expect(screen.queryByText('commercial dashboard')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: 'Comercial' }));
    expect(screen.getByText('commercial dashboard')).toBeInTheDocument();
  });

  it('remembers the last view', () => {
    const { unmount } = render(<AdvisorHome user={advisor('plan-1')} />);
    fireEvent.click(screen.getByRole('tab', { name: 'Mi plan' }));
    unmount();
    render(<AdvisorHome user={advisor('plan-1')} />);
    expect(screen.getByText('affiliate dashboard')).toBeInTheDocument();
  });
});

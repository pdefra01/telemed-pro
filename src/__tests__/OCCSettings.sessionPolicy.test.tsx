import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import OCCSettings from '../pages/admin/OCCSettings';
import { systemSettingsRepository } from '../repositories/SystemSettingsRepository';

vi.mock('../repositories/TaxRepository', () => ({ taxRepository: { getAll: vi.fn().mockResolvedValue([]) } }));
vi.mock('../repositories/OfficeLocationRepository', () => ({ officeLocationRepository: { getAllOffices: vi.fn().mockResolvedValue([]) } }));
vi.mock('../repositories/SystemSettingsRepository', () => ({ systemSettingsRepository: { getByKey: vi.fn(), update: vi.fn() } }));
vi.mock('../context/ToastContext', () => ({ useToast: () => ({ toast: vi.fn() }) }));

// A policy saved before the supervisor role existed
const storedPolicy = {
  admin: { timeoutMinutes: 15, persistent: false },
  doctor: { timeoutMinutes: 30, persistent: false },
  advisor: { timeoutMinutes: 30, persistent: false },
  patient: { timeoutMinutes: 0, persistent: true },
};

describe('OCCSettings session policy', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(systemSettingsRepository.getByKey).mockImplementation(async (key: string) =>
      key === 'session_security_policy' ? storedPolicy : null
    );
    vi.mocked(systemSettingsRepository.update).mockResolvedValue(undefined);
  });

  it('lists supervisors with their default (15 min, not persistent) when the stored policy lacks them, and saves them', async () => {
    render(<OCCSettings />);

    const supervisor = await screen.findByTestId('session-role-supervisor');
    expect(within(supervisor).getByRole('heading', { name: 'Supervisor' })).toBeInTheDocument();
    await waitFor(() => expect(within(supervisor).getByRole('spinbutton', { name: /inactividad/i })).toHaveValue(15));
    expect(within(supervisor).getByRole('checkbox')).not.toBeChecked();

    fireEvent.click(screen.getByRole('button', { name: /guardar políticas/i }));

    await waitFor(() => expect(systemSettingsRepository.update).toHaveBeenCalledWith(
      'session_security_policy',
      expect.objectContaining({ supervisor: { timeoutMinutes: 15, persistent: false }, advisor: storedPolicy.advisor })
    ));
  });

  it('keeps the stored values of the other roles', async () => {
    render(<OCCSettings />);

    const advisor = await screen.findByTestId('session-role-advisor');
    await waitFor(() => expect(within(advisor).getByRole('spinbutton', { name: /inactividad/i })).toHaveValue(30));
  });
});

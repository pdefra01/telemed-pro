import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import OCCSettings from '../pages/admin/OCCSettings';
import { systemSettingsRepository } from '../repositories/SystemSettingsRepository';

vi.mock('../repositories/TaxRepository', () => ({ taxRepository: { getAll: vi.fn().mockResolvedValue([]) } }));
vi.mock('../repositories/OfficeLocationRepository', () => ({ officeLocationRepository: { getAllOffices: vi.fn().mockResolvedValue([]) } }));
vi.mock('../repositories/SystemSettingsRepository', () => ({ systemSettingsRepository: { getByKey: vi.fn(), update: vi.fn() } }));
vi.mock('../context/ToastContext', () => ({ useToast: () => ({ toast: vi.fn() }) }));

const SWITCH = { name: /mostrar comisiones a asesores y supervisores/i };

const storedVisibility = (value: unknown) =>
  vi.mocked(systemSettingsRepository.getByKey).mockImplementation(async (key: string) =>
    key === 'commission_visibility' ? value : null
  );

describe('OCCSettings commission visibility switch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(systemSettingsRepository.update).mockResolvedValue(undefined);
  });

  it('starts off when nothing is stored', async () => {
    storedVisibility(null);
    render(<OCCSettings />);

    const toggle = await screen.findByRole('checkbox', SWITCH);
    await waitFor(() => expect(systemSettingsRepository.getByKey).toHaveBeenCalledWith('commission_visibility'));
    expect(toggle).not.toBeChecked();
  });

  it('shows the stored value', async () => {
    storedVisibility({ visible: true });
    render(<OCCSettings />);

    await waitFor(() => expect(screen.getByRole('checkbox', SWITCH)).toBeChecked());
  });

  it('saves the new value when the admin flips it', async () => {
    storedVisibility({ visible: false });
    render(<OCCSettings />);

    const toggle = await screen.findByRole('checkbox', SWITCH);
    fireEvent.click(toggle);

    await waitFor(() => expect(systemSettingsRepository.update).toHaveBeenCalledWith('commission_visibility', { visible: true }));
    expect(toggle).toBeChecked();
  });

  it('keeps the previous value when saving fails', async () => {
    storedVisibility({ visible: true });
    vi.mocked(systemSettingsRepository.update).mockRejectedValue(new Error('denied'));
    render(<OCCSettings />);

    const toggle = await screen.findByRole('checkbox', SWITCH);
    await waitFor(() => expect(toggle).toBeChecked());
    fireEvent.click(toggle);

    await waitFor(() => expect(systemSettingsRepository.update).toHaveBeenCalledWith('commission_visibility', { visible: false }));
    await waitFor(() => expect(toggle).toBeChecked());
  });
});

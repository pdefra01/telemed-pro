import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import Profile from '../Profile';
import { MOCK_PATIENT } from '../../../constants';
import { affiliateRepository } from '../../../repositories/AffiliateRepository';
import { BrowserRouter } from 'react-router-dom';
import React from 'react';

// Mock AffiliateRepository
vi.mock('../../../repositories/AffiliateRepository', () => ({
  affiliateRepository: {
    updateAffiliate: vi.fn(),
  },
}));

// Mock ToastContext
const mockToast = vi.fn();
vi.mock('../../../context/ToastContext', () => ({
  useToast: () => ({ toast: mockToast }),
}));

const mockOnLogin = vi.fn();

const renderWithRouter = (ui: React.ReactElement) => {
  return render(ui, { wrapper: BrowserRouter });
};

describe('Patient Profile Screen', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders read-only and editable fields with initial user data', () => {
    renderWithRouter(<Profile user={MOCK_PATIENT} onLogin={mockOnLogin} />);

    // Read-only fields
    const dniInput = screen.getByLabelText(/DNI/i) as HTMLInputElement;
    expect(dniInput.value).toBe(MOCK_PATIENT.dni);
    expect(dniInput.readOnly).toBe(true);

    const emailInput = screen.getByLabelText(/Correo Electrónico/i) as HTMLInputElement;
    expect(emailInput.value).toBe(MOCK_PATIENT.email);
    expect(emailInput.readOnly).toBe(true);

    const planInput = screen.getByLabelText(/Plan de Cobertura/i) as HTMLInputElement;
    expect(planInput.value).toBe(MOCK_PATIENT.planName);
    expect(planInput.readOnly).toBe(true);

    // Editable fields
    const nameInput = screen.getByLabelText(/Nombre Completo/i) as HTMLInputElement;
    expect(nameInput.value).toBe(MOCK_PATIENT.name);
    expect(nameInput.readOnly).toBe(false);

    const phoneInput = screen.getByLabelText(/Número de Teléfono/i) as HTMLInputElement;
    expect(phoneInput.value).toBe(MOCK_PATIENT.phone || '');

    const addressInput = screen.getByLabelText(/Dirección/i) as HTMLInputElement;
    expect(addressInput.value).toBe(MOCK_PATIENT.address || '');
  });

  it('never fabricates "Plan Base" when the user has no planName — shows the honest "Sin plan asignado" instead', () => {
    const userWithoutPlan = { ...MOCK_PATIENT, planName: undefined };

    renderWithRouter(<Profile user={userWithoutPlan} onLogin={mockOnLogin} />);

    const planInput = screen.getByLabelText(/Plan de Cobertura/i) as HTMLInputElement;
    expect(planInput.value).toBe('Sin plan asignado');
  });

  it('prevents submission and displays an error if full name is empty', async () => {
    renderWithRouter(<Profile user={MOCK_PATIENT} onLogin={mockOnLogin} />);

    const nameInput = screen.getByLabelText(/Nombre Completo/i);
    fireEvent.change(nameInput, { target: { value: '   ' } });

    const saveButton = screen.getByRole('button', { name: /Guardar Cambios/i });
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith('El nombre completo no puede estar vacío', 'error');
    });

    expect(affiliateRepository.updateAffiliate).not.toHaveBeenCalled();
  });

  it('calls updateAffiliate and updates active session on successful submission', async () => {
    const updatedUser = {
      ...MOCK_PATIENT,
      name: 'Juan Actualizado',
      phone: '+54 9 11 9999-8888',
      address: 'Av. Siempre Viva 742',
    };

    vi.mocked(affiliateRepository.updateAffiliate).mockResolvedValue(updatedUser);

    renderWithRouter(<Profile user={MOCK_PATIENT} onLogin={mockOnLogin} />);

    // Modify editable inputs
    const nameInput = screen.getByLabelText(/Nombre Completo/i);
    fireEvent.change(nameInput, { target: { value: 'Juan Actualizado' } });

    const phoneInput = screen.getByLabelText(/Número de Teléfono/i);
    fireEvent.change(phoneInput, { target: { value: '+54 9 11 9999-8888' } });

    const addressInput = screen.getByLabelText(/Dirección/i);
    fireEvent.change(addressInput, { target: { value: 'Av. Siempre Viva 742' } });

    // Submit form
    const saveButton = screen.getByRole('button', { name: /Guardar Cambios/i });
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(affiliateRepository.updateAffiliate).toHaveBeenCalledWith(MOCK_PATIENT.id, expect.objectContaining({
        name: 'Juan Actualizado',
        phone: '+54 9 11 9999-8888',
        address: 'Av. Siempre Viva 742',
      }));
    });

    await waitFor(() => {
      expect(mockOnLogin).toHaveBeenCalledWith(updatedUser);
      expect(mockToast).toHaveBeenCalledWith('Perfil actualizado con éxito', 'success');
    });
  });
});

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AdhesionForm } from '../AdhesionForm';
import { adhesionRepository } from '../../repositories/AdhesionRepository';

// Mock AdhesionRepository
vi.mock('../../repositories/AdhesionRepository', () => ({
  adhesionRepository: {
    submitApplication: vi.fn()
  }
}));

// Mock ToastContext
const mockToast = vi.fn();
vi.mock('../../context/ToastContext', () => ({
  useToast: () => ({ toast: mockToast })
}));

const renderForm = () => render(<AdhesionForm />, { wrapper: MemoryRouter });

const fillTitularStep1 = (options?: { skipCuil?: boolean; cuilValue?: string }) => {
  fireEvent.change(screen.getByPlaceholderText('Juan'), { target: { value: 'Juan' } });
  fireEvent.change(screen.getByPlaceholderText('Pérez'), { target: { value: 'Pérez' } });
  fireEvent.change(screen.getByPlaceholderText('Sin puntos ni espacios'), { target: { value: '30123456' } });
  if (!options?.skipCuil) {
    fireEvent.change(screen.getByPlaceholderText('Ej: 20-12345678-9'), {
      target: { value: options?.cuilValue ?? '20-30123456-7' }
    });
  }
  const birthDateInput = document.querySelector('input[type="date"]') as HTMLInputElement;
  fireEvent.change(birthDateInput, { target: { value: '1990-01-01' } });
  fireEvent.change(screen.getByPlaceholderText('Ej: Av. Belgrano 1234, Piso 2 A'), { target: { value: 'Calle Falsa 123' } });
  fireEvent.change(screen.getByPlaceholderText('Rosario'), { target: { value: 'Rosario' } });
  fireEvent.change(screen.getByPlaceholderText('Centro'), { target: { value: 'Centro' } });
  fireEvent.change(screen.getByPlaceholderText('nombre@ejemplo.com'), { target: { value: 'juan@test.com' } });
  fireEvent.change(screen.getByPlaceholderText('3416123456'), { target: { value: '3416123456' } });
};

/**
 * Drives the wizard from Step 1 into Step 5, ready to submit. Email OTP
 * verification is currently suspended (EMAIL_VERIFICATION_REQUIRED = false
 * in AdhesionForm.tsx), so Step 1 advances without it.
 */
const advanceToSignatureStep = async () => {
  fillTitularStep1();

  fireEvent.click(screen.getByRole('button', { name: /Siguiente/i })); // -> Step 2
  fireEvent.click(screen.getByRole('button', { name: /Siguiente/i })); // -> Step 3
  fireEvent.click(screen.getByRole('button', { name: /Siguiente/i })); // -> Step 4
  fireEvent.click(screen.getByRole('button', { name: /Siguiente/i })); // -> Step 5

  await waitFor(() => expect(screen.getByText(/Condiciones, Consentimiento y Firma/i)).toBeInTheDocument());
};

describe('AdhesionForm - CUIL field and duplicate-rejection handling', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // jsdom does not implement 2D canvas rendering; stub it so the signature step can be completed.
    HTMLCanvasElement.prototype.getContext = vi.fn().mockReturnValue({
      strokeStyle: '',
      lineWidth: 0,
      lineCap: '',
      lineJoin: '',
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      stroke: vi.fn(),
      clearRect: vi.fn()
    }) as any;
    HTMLCanvasElement.prototype.toDataURL = vi.fn().mockReturnValue('data:image/png;base64,xxx') as any;

    vi.spyOn(window, 'fetch').mockImplementation(() =>
      Promise.resolve({ ok: true, json: async () => ({}) } as Response)
    );
  });

  it('renders a CUIL input for the titular in Step 1', () => {
    renderForm();
    expect(screen.getByPlaceholderText('Ej: 20-12345678-9')).toBeInTheDocument();
  });

  it('blocks advancing to Step 2 when the titular CUIL is missing', () => {
    renderForm();
    fillTitularStep1({ skipCuil: true });

    fireEvent.click(screen.getByRole('button', { name: /Siguiente/i }));

    expect(mockToast).toHaveBeenCalledWith(
      'Por favor completá todos los campos obligatorios del titular',
      'warning'
    );
  });

  it('blocks advancing to Step 2 when the titular CUIL has an invalid format', () => {
    renderForm();
    fillTitularStep1({ cuilValue: '123' });

    fireEvent.click(screen.getByRole('button', { name: /Siguiente/i }));

    expect(mockToast).toHaveBeenCalledWith(
      'El CUIL debe tener 11 dígitos, con o sin guiones (formato NN-DDDDDDDD-C)',
      'warning'
    );
  });

  it('surfaces the duplicate-check conflict message via toast when submitApplication is rejected', async () => {
    vi.mocked(adhesionRepository.submitApplication).mockRejectedValueOnce(
      new Error('Este DNI ya se encuentra afiliado a Medinex.')
    );

    const { container } = renderForm();
    await advanceToSignatureStep();

    fireEvent.click(
      screen.getByLabelText(/Autorizo el tratamiento de mis datos personales/i)
    );

    const canvas = container.querySelector('canvas') as HTMLCanvasElement;
    fireEvent.mouseDown(canvas);
    fireEvent.mouseUp(canvas);

    fireEvent.click(screen.getByRole('button', { name: /Enviar Solicitud/i }));

    await waitFor(() => {
      expect(adhesionRepository.submitApplication).toHaveBeenCalled();
    });

    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith('Este DNI ya se encuentra afiliado a Medinex.', 'error');
    });
  });
});

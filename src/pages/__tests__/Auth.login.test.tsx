import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import Auth from '../Auth';
import { authRepository } from '../../repositories/AuthRepository';

vi.mock('../../repositories/AuthRepository', () => ({
  authRepository: {
    login: vi.fn(),
    registerPatient: vi.fn(),
  },
}));

const renderAuth = () => render(<Auth onLogin={vi.fn()} />);

const fillAndSubmit = (identifier: string, password = 'password123') => {
  const identifierInput = screen.getByLabelText('Correo Electrónico');
  fireEvent.change(identifierInput, { target: { value: identifier } });

  const passwordInput = screen.getByLabelText('Contraseña');
  fireEvent.change(passwordInput, { target: { value: password } });

  fireEvent.click(screen.getByRole('button', { name: /Ingresar/i }));
};

describe('Auth — patient login sequence (D6)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('email input triggers exactly 1 login call, with the email as typed', async () => {
    vi.mocked(authRepository.login).mockResolvedValueOnce({ id: 'u1' } as any);
    renderAuth();

    fillAndSubmit('juan@test.com');

    await waitFor(() => expect(authRepository.login).toHaveBeenCalledTimes(1));
    expect(authRepository.login).toHaveBeenCalledWith('juan@test.com', 'password123', 'patient');
  });

  it('DNI input (no @) triggers exactly 1 login call, against the legacy-mapped address — no premature attempt with the raw DNI as email', async () => {
    vi.mocked(authRepository.login).mockResolvedValueOnce({ id: 'u1' } as any);
    renderAuth();

    fillAndSubmit('30123456');

    await waitFor(() => expect(authRepository.login).toHaveBeenCalledTimes(1));
    expect(authRepository.login).toHaveBeenCalledWith('30123456@medinex-paciente.com', 'password123', 'patient');
  });

  it('shows an explicit "use your email" message when the legacy-mapped DNI attempt fails with invalid_credentials, without retrying', async () => {
    const invalidCredentialsError: any = new Error('Credenciales incorrectas. Verificá tu documento y contraseña.');
    invalidCredentialsError.code = 'invalid_credentials';
    vi.mocked(authRepository.login).mockRejectedValueOnce(invalidCredentialsError);
    renderAuth();

    fillAndSubmit('30123456');

    await waitFor(() => {
      expect(screen.getByText(/correo electrónico/i)).toBeInTheDocument();
    });
    expect(authRepository.login).toHaveBeenCalledTimes(1);
  });

  it('shows the inactive-account message as-is, with zero retries, when the account exists but is inactive', async () => {
    vi.mocked(authRepository.login).mockRejectedValueOnce(
      new Error('Tu cuenta está inactiva o pendiente de aprobación por administración. Por favor, contactate con soporte.')
    );
    renderAuth();

    fillAndSubmit('inactive@test.com');

    await waitFor(() => {
      expect(screen.getByText(/Tu cuenta está inactiva o pendiente de aprobación/i)).toBeInTheDocument();
    });
    expect(authRepository.login).toHaveBeenCalledTimes(1);
  });
});

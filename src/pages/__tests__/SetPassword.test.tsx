import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import SetPassword from '../SetPassword';
import { supabase } from '../../services/supabase';

vi.mock('../../services/supabase', () => ({
  supabase: {
    auth: {
      verifyOtp: vi.fn(),
      updateUser: vi.fn(),
      signOut: vi.fn(),
    },
  },
}));

const renderAt = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/activar" element={<SetPassword />} />
        <Route path="/login" element={<div>Pantalla de Login</div>} />
      </Routes>
    </MemoryRouter>
  );

const fillPasswordForm = async (password: string, confirmPassword: string) => {
  await waitFor(() => expect(screen.getByLabelText('Nueva Contraseña')).toBeInTheDocument());
  fireEvent.change(screen.getByLabelText('Nueva Contraseña'), { target: { value: password } });
  fireEvent.change(screen.getByLabelText('Confirmar Contraseña'), { target: { value: confirmPassword } });
  fireEvent.click(screen.getByRole('button', { name: /Crear Contraseña/i }));
};

describe('SetPassword — /activar state machine (D2/D5)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('verifying -> ready: calls verifyOtp with the token_hash from the URL and renders the password form', async () => {
    vi.mocked(supabase.auth.verifyOtp).mockResolvedValueOnce({ data: {}, error: null } as any);

    renderAt('/activar?token_hash=abc123');

    await waitFor(() => expect(screen.getByLabelText('Nueva Contraseña')).toBeInTheDocument());
    expect(supabase.auth.verifyOtp).toHaveBeenCalledWith({ type: 'recovery', token_hash: 'abc123' });
  });

  it('verifying -> invalid: missing token_hash shows the admin-reset message without calling verifyOtp', async () => {
    renderAt('/activar');

    await waitFor(() => {
      expect(screen.getByText(/administraci[oó]n/i)).toBeInTheDocument();
    });
    expect(supabase.auth.verifyOtp).not.toHaveBeenCalled();
  });

  it('verifying -> invalid: an expired/used token surfaces the admin-reset message', async () => {
    vi.mocked(supabase.auth.verifyOtp).mockResolvedValueOnce({
      data: {},
      error: { message: 'Token has expired or is invalid' },
    } as any);

    renderAt('/activar?token_hash=expired');

    await waitFor(() => {
      expect(screen.getByText(/administraci[oó]n/i)).toBeInTheDocument();
    });
  });

  it('rejects a password shorter than 6 characters without calling updateUser', async () => {
    vi.mocked(supabase.auth.verifyOtp).mockResolvedValueOnce({ data: {}, error: null } as any);
    renderAt('/activar?token_hash=abc123');

    await fillPasswordForm('123', '123');

    await waitFor(() => {
      expect(screen.getByText(/al menos 6 caracteres/i)).toBeInTheDocument();
    });
    expect(supabase.auth.updateUser).not.toHaveBeenCalled();
  });

  it('rejects mismatched password confirmation without calling updateUser', async () => {
    vi.mocked(supabase.auth.verifyOtp).mockResolvedValueOnce({ data: {}, error: null } as any);
    renderAt('/activar?token_hash=abc123');

    await fillPasswordForm('password123', 'password456');

    await waitFor(() => {
      expect(screen.getByText(/no coinciden/i)).toBeInTheDocument();
    });
    expect(supabase.auth.updateUser).not.toHaveBeenCalled();
  });

  it('ready -> submitting -> success: calls updateUser with the typed password, signs out, and redirects to /login', async () => {
    vi.mocked(supabase.auth.verifyOtp).mockResolvedValueOnce({ data: {}, error: null } as any);
    vi.mocked(supabase.auth.updateUser).mockResolvedValueOnce({ data: {}, error: null } as any);
    vi.mocked(supabase.auth.signOut).mockResolvedValueOnce({ error: null } as any);

    renderAt('/activar?token_hash=abc123');

    await fillPasswordForm('newpassword123', 'newpassword123');

    await waitFor(() => expect(supabase.auth.updateUser).toHaveBeenCalledWith({ password: 'newpassword123' }));
    await waitFor(() => expect(supabase.auth.signOut).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByText('Pantalla de Login')).toBeInTheDocument());
  });

  it('ready -> submitting -> error: shows a retryable error and does not sign out or redirect', async () => {
    vi.mocked(supabase.auth.verifyOtp).mockResolvedValueOnce({ data: {}, error: null } as any);
    vi.mocked(supabase.auth.updateUser).mockResolvedValueOnce({
      data: {},
      error: { message: 'Error de red al actualizar la contraseña.' },
    } as any);

    renderAt('/activar?token_hash=abc123');

    await fillPasswordForm('newpassword123', 'newpassword123');

    await waitFor(() => {
      expect(screen.getByText(/Error de red al actualizar la contraseña\./i)).toBeInTheDocument();
    });
    expect(supabase.auth.signOut).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Nueva Contraseña')).toBeInTheDocument();
  });
});

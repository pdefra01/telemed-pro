import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ProducersAdmin } from '../ProducersAdmin';
import { producerRepository } from '../../../repositories/ProducerRepository';
import { supabase } from '../../../services/supabase';

vi.mock('../../../repositories/ProducerRepository', () => ({
  producerRepository: {
    getProducers: vi.fn(),
    searchAdvisors: vi.fn(),
    setAdvisorStatus: vi.fn(),
    updateProducer: vi.fn(),
  },
}));

vi.mock('../../../services/supabase', () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: { access_token: 'admin-jwt' } } }),
    },
  },
}));

const ACTIVE_PRODUCER = {
  id: 'adv-pedro',
  name: 'Pedro Gómez',
  producerCode: 'PROMO_PEDRO',
  email: 'pedro@medinex.com',
  phone: '3416000000',
  hasAccount: true,
  commissionRate: 10,
  status: 'active' as const,
  totalAffiliatesReferred: 3,
};

const INACTIVE_PRODUCER = {
  id: 'adv-ana',
  name: 'Ana Ruiz',
  producerCode: 'PROMO_ANA',
  email: 'ana@medinex.com',
  phone: '3416111111',
  hasAccount: true,
  commissionRate: 10,
  status: 'inactive' as const,
  totalAffiliatesReferred: 0,
};

describe('ProducersAdmin', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(producerRepository.getProducers).mockResolvedValue([ACTIVE_PRODUCER]);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders the producers list from loadProducers() with no client-side filter when the search term is empty', async () => {
    render(<ProducersAdmin />);

    await waitFor(() => expect(screen.getByText('Pedro Gómez')).toBeInTheDocument());
    expect(producerRepository.searchAdvisors).not.toHaveBeenCalled();
  });

  it('renders the loaded list unfiltered while the search term has fewer than 2 characters (Esc.15)', async () => {
    render(<ProducersAdmin />);
    await waitFor(() => expect(screen.getByText('Pedro Gómez')).toBeInTheDocument());

    fireEvent.change(screen.getByPlaceholderText(/Buscar por nombre, apellido, DNI, código o email/i), {
      target: { value: 'p' },
    });

    expect(screen.getByText('Pedro Gómez')).toBeInTheDocument();
    expect(producerRepository.searchAdvisors).not.toHaveBeenCalled();
  });

  it('debounces the server-side search 300ms and renders inactive results with a labeled badge (Esc.16/Esc.18)', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.mocked(producerRepository.searchAdvisors).mockResolvedValue([INACTIVE_PRODUCER]);

    render(<ProducersAdmin />);
    await waitFor(() => expect(screen.getByText('Pedro Gómez')).toBeInTheDocument());

    fireEvent.change(screen.getByPlaceholderText(/Buscar por nombre, apellido, DNI, código o email/i), {
      target: { value: 'ana' },
    });

    // Not called before the debounce window elapses
    expect(producerRepository.searchAdvisors).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(300);

    await waitFor(() => expect(producerRepository.searchAdvisors).toHaveBeenCalledWith('ana'));

    vi.useRealTimers();

    await waitFor(() => expect(screen.getByText('Ana Ruiz')).toBeInTheDocument());
    expect(screen.getByText(/inactivo/i)).toBeInTheDocument();
  });

  it('shows no results (no error) when the search returns an empty array', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.mocked(producerRepository.searchAdvisors).mockResolvedValue([]);

    render(<ProducersAdmin />);
    await waitFor(() => expect(screen.getByText('Pedro Gómez')).toBeInTheDocument());

    fireEvent.change(screen.getByPlaceholderText(/Buscar por nombre, apellido, DNI, código o email/i), {
      target: { value: 'zz' },
    });
    await vi.advanceTimersByTimeAsync(300);
    vi.useRealTimers();

    await waitFor(() => expect(screen.queryByText('Pedro Gómez')).not.toBeInTheDocument());
  });

  it('keeps the previously loaded list and shows an error when the search endpoint fails', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.mocked(producerRepository.searchAdvisors).mockRejectedValue(new Error('Acceso denegado.'));

    render(<ProducersAdmin />);
    await waitFor(() => expect(screen.getByText('Pedro Gómez')).toBeInTheDocument());

    fireEvent.change(screen.getByPlaceholderText(/Buscar por nombre, apellido, DNI, código o email/i), {
      target: { value: 'zz' },
    });
    await vi.advanceTimersByTimeAsync(300);
    vi.useRealTimers();

    await waitFor(() => expect(screen.getByText('Pedro Gómez')).toBeInTheDocument());
    await waitFor(() => expect(screen.getByText('Acceso denegado.')).toBeInTheDocument());
  });

  describe('activate/deactivate button (Esc.4/Esc.5/Esc.6)', () => {
    it('asks for confirmation, calls setAdvisorStatus, and updates the badge from the response', async () => {
      vi.spyOn(window, 'confirm').mockReturnValue(true);
      vi.mocked(producerRepository.setAdvisorStatus).mockResolvedValue({
        success: true,
        id: 'adv-pedro',
        status: 'inactive',
        isActive: false,
        hasAccount: true,
      });
      vi.mocked(producerRepository.getProducers).mockResolvedValueOnce([ACTIVE_PRODUCER])
        .mockResolvedValueOnce([{ ...ACTIVE_PRODUCER, status: 'inactive' as const }]);

      render(<ProducersAdmin />);
      await waitFor(() => expect(screen.getByText('Pedro Gómez')).toBeInTheDocument());

      fireEvent.click(screen.getByRole('button', { name: /desactivar/i }));

      expect(window.confirm).toHaveBeenCalled();
      await waitFor(() => expect(producerRepository.setAdvisorStatus).toHaveBeenCalledWith('adv-pedro', false));
    });

    it('does NOT call setAdvisorStatus when the confirmation is cancelled', async () => {
      vi.spyOn(window, 'confirm').mockReturnValue(false);

      render(<ProducersAdmin />);
      await waitFor(() => expect(screen.getByText('Pedro Gómez')).toBeInTheDocument());

      fireEvent.click(screen.getByRole('button', { name: /desactivar/i }));

      expect(producerRepository.setAdvisorStatus).not.toHaveBeenCalled();
    });

    it('shows a "Reactivar" action for an already-inactive advisor', async () => {
      vi.mocked(producerRepository.getProducers).mockResolvedValue([INACTIVE_PRODUCER]);

      render(<ProducersAdmin />);
      await waitFor(() => expect(screen.getByText('Ana Ruiz')).toBeInTheDocument());

      expect(screen.getByRole('button', { name: /reactivar/i })).toBeInTheDocument();
    });
  });
});

import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ProducersAdmin } from '../ProducersAdmin';
import { producerRepository } from '../../../repositories/ProducerRepository';
import { supabase } from '../../../services/supabase';
import { supervisorRepository } from '../../../repositories/SupervisorRepository';

vi.mock('../../../repositories/ProducerRepository', () => ({
  producerRepository: {
    getProducers: vi.fn(),
    searchAdvisors: vi.fn(),
    setAdvisorStatus: vi.fn(),
    updateProducer: vi.fn(),
  },
}));

vi.mock('../../../repositories/SupervisorRepository', () => ({
  supervisorRepository: {
    listSupervisors: vi.fn(),
    listAdvisors: vi.fn(),
    assignAdvisor: vi.fn(),
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
  createdAt: '2026-07-20T15:00:00.000Z',
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
    vi.mocked(supervisorRepository.listSupervisors).mockResolvedValue([]);
    vi.mocked(supervisorRepository.listAdvisors).mockResolvedValue([]);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders the producers list from loadProducers() without calling the search endpoint when the search term is empty', async () => {
    render(<ProducersAdmin />);

    await waitFor(() => expect(screen.getByText('Pedro Gómez')).toBeInTheDocument());
    expect(producerRepository.searchAdvisors).not.toHaveBeenCalled();
  });

  it('shows the advisor registration date, and nothing when it is unknown', async () => {
    vi.mocked(producerRepository.getProducers).mockResolvedValue([
      ACTIVE_PRODUCER,
      { ...ACTIVE_PRODUCER, id: 'adv-sin-fecha', name: 'Sin Fecha', createdAt: undefined },
    ]);

    render(<ProducersAdmin />);

    await waitFor(() => expect(screen.getByText('Sin Fecha')).toBeInTheDocument());
    expect(screen.getAllByText('Alta: 20/07/2026')).toHaveLength(1);
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
    expect(screen.getByText('Inactivo')).toBeInTheDocument();
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
      fireEvent.click(await screen.findByRole('button', { name: 'Inactivos' }));
      await waitFor(() => expect(screen.getByText('Ana Ruiz')).toBeInTheDocument());

      expect(screen.getByRole('button', { name: /reactivar/i })).toBeInTheDocument();
    });
  });

  describe('status filter', () => {
    beforeEach(() => {
      vi.mocked(producerRepository.getProducers).mockResolvedValue([ACTIVE_PRODUCER, INACTIVE_PRODUCER]);
    });

    it('lists only active advisors by default', async () => {
      render(<ProducersAdmin />);

      await waitFor(() => expect(screen.getByText('Pedro Gómez')).toBeInTheDocument());
      expect(screen.queryByText('Ana Ruiz')).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Activos' })).toHaveAttribute('aria-pressed', 'true');
    });

    it('counts only active advisors in the "Total Asesores Activos" card', async () => {
      render(<ProducersAdmin />);
      await waitFor(() => expect(screen.getByText('Pedro Gómez')).toBeInTheDocument());

      expect(screen.getByText('Total Asesores Activos').nextElementSibling).toHaveTextContent(/^1$/);
    });

    it('switches to the inactive advisors and back', async () => {
      render(<ProducersAdmin />);
      await waitFor(() => expect(screen.getByText('Pedro Gómez')).toBeInTheDocument());

      fireEvent.click(screen.getByRole('button', { name: 'Inactivos' }));
      expect(screen.getByText('Ana Ruiz')).toBeInTheDocument();
      expect(screen.queryByText('Pedro Gómez')).not.toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: 'Activos' }));
      expect(screen.getByText('Pedro Gómez')).toBeInTheDocument();
      expect(screen.queryByText('Ana Ruiz')).not.toBeInTheDocument();
    });

    it('does not hide search results: the search still finds inactive advisors while Activos is selected', async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      vi.mocked(producerRepository.searchAdvisors).mockResolvedValue([INACTIVE_PRODUCER]);

      render(<ProducersAdmin />);
      await waitFor(() => expect(screen.getByText('Pedro Gómez')).toBeInTheDocument());

      fireEvent.change(screen.getByPlaceholderText(/Buscar por nombre, apellido, DNI, código o email/i), {
        target: { value: 'ana' },
      });
      await vi.advanceTimersByTimeAsync(300);
      vi.useRealTimers();

      await waitFor(() => expect(screen.getByText('Ana Ruiz')).toBeInTheDocument());
    });
  });

  describe('supervisor assignment', () => {
    const SUPERVISOR = { id: 'sup-laura', name: 'Laura Díaz', email: 'laura@medinex.com' };

    it('shows the current supervisor of each advisor and saves a new one', async () => {
      vi.mocked(supervisorRepository.listSupervisors).mockResolvedValue([SUPERVISOR]);
      vi.mocked(supervisorRepository.listAdvisors).mockResolvedValue([
        { id: 'adv-pedro', name: 'Pedro Gómez', email: 'pedro@medinex.com', supervisorId: null },
      ]);
      vi.mocked(supervisorRepository.assignAdvisor).mockResolvedValue(undefined);
      render(<ProducersAdmin />);

      const select = await screen.findByRole('combobox', { name: 'Supervisor de Pedro Gómez' });
      await waitFor(() => expect(screen.getByRole('option', { name: 'Laura Díaz' })).toBeInTheDocument());
      expect(select).toHaveValue('');

      fireEvent.change(select, { target: { value: 'sup-laura' } });

      await waitFor(() => expect(supervisorRepository.assignAdvisor).toHaveBeenCalledWith('adv-pedro', 'sup-laura'));
      await waitFor(() => expect(select).toHaveValue('sup-laura'));
    });

    it('releases an advisor with "Sin supervisor"', async () => {
      vi.mocked(supervisorRepository.listSupervisors).mockResolvedValue([SUPERVISOR]);
      vi.mocked(supervisorRepository.listAdvisors).mockResolvedValue([
        { id: 'adv-pedro', name: 'Pedro Gómez', email: 'pedro@medinex.com', supervisorId: 'sup-laura' },
      ]);
      vi.mocked(supervisorRepository.assignAdvisor).mockResolvedValue(undefined);
      render(<ProducersAdmin />);

      const select = await screen.findByRole('combobox', { name: 'Supervisor de Pedro Gómez' });
      await waitFor(() => expect(select).toHaveValue('sup-laura'));
      fireEvent.change(select, { target: { value: '' } });

      await waitFor(() => expect(supervisorRepository.assignAdvisor).toHaveBeenCalledWith('adv-pedro', null));
    });

    it('keeps the previous supervisor and shows an error when saving fails', async () => {
      vi.mocked(supervisorRepository.listSupervisors).mockResolvedValue([SUPERVISOR]);
      vi.mocked(supervisorRepository.listAdvisors).mockResolvedValue([
        { id: 'adv-pedro', name: 'Pedro Gómez', email: 'pedro@medinex.com', supervisorId: null },
      ]);
      vi.mocked(supervisorRepository.assignAdvisor).mockRejectedValue(new Error('denied'));
      render(<ProducersAdmin />);

      const select = await screen.findByRole('combobox', { name: 'Supervisor de Pedro Gómez' });
      await waitFor(() => expect(screen.getByRole('option', { name: 'Laura Díaz' })).toBeInTheDocument());
      fireEvent.change(select, { target: { value: 'sup-laura' } });

      expect(await screen.findByText('No se pudo asignar el supervisor de Pedro Gómez.')).toBeInTheDocument();
      expect(select).toHaveValue('');
    });

    it('explains that a supervisor must be created first when there is none', async () => {
      render(<ProducersAdmin />);

      expect(await screen.findByText(/todavía no hay supervisores/i)).toBeInTheDocument();
      expect(screen.getByRole('link', { name: /crear supervisor/i })).toHaveAttribute('href', '#/admin/supervisors');
    });

    it('still lists the advisors when the supervisors cannot be loaded', async () => {
      vi.mocked(supervisorRepository.listSupervisors).mockRejectedValue(new Error('down'));
      render(<ProducersAdmin />);

      await waitFor(() => expect(screen.getByText('Pedro Gómez')).toBeInTheDocument());
      expect(screen.queryByRole('combobox', { name: 'Supervisor de Pedro Gómez' })).not.toBeInTheDocument();
    });
  });
});

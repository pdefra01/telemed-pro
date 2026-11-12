import { render, screen, fireEvent, within, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Prospects } from '../Prospects';
import { prospectRepository } from '../../../repositories/ProspectRepository';
import { supervisorRepository } from '../../../repositories/SupervisorRepository';
import { Prospect, User } from '../../../types';

vi.mock('../../../repositories/ProspectRepository', () => ({
  PROSPECT_PAGE_SIZE: 100,
  prospectRepository: { list: vi.fn(), countByStatus: vi.fn(), create: vi.fn(), update: vi.fn(), remove: vi.fn() },
}));

vi.mock('../../../repositories/SupervisorRepository', () => ({
  supervisorRepository: { listAdvisors: vi.fn() },
}));

vi.mock('../MonthlyProgress', () => ({
  MonthlyProgress: () => <div data-testid="monthly-progress" />,
}));

const supervisor: User = { id: 'sup-1', name: 'Silvia Sup', email: 'sup@test.local', role: 'supervisor' };
const admin: User = { id: 'adm-1', name: 'Admin', email: 'admin@test.local', role: 'admin' };

const build = (over: Partial<Prospect>): Prospect => ({
  id: 'p-1',
  advisorId: 'adv-1',
  advisorName: 'Pedro Gómez',
  fullName: 'Laura Pérez',
  status: 'new',
  source: 'manual',
  createdAt: '2026-11-01T12:00:00Z',
  updatedAt: '2026-11-01T12:00:00Z',
  ...over,
});

const rows: Prospect[] = [
  build({ id: 'p-1', fullName: 'Laura Pérez', status: 'new', phone: '3875111222' }),
  build({ id: 'p-2', fullName: 'Marcos Díaz', status: 'interested', lastContactAt: '2026-11-10T12:00:00Z' }),
  build({ id: 'p-3', fullName: 'Sofía Ruiz', status: 'affiliated', advisorId: 'adv-2', advisorName: 'Ana Torres' }),
];

const teamAdvisors = [
  { id: 'adv-2', name: 'Ana Torres', email: 'ana@test.local', supervisorId: 'sup-1' },
  { id: 'adv-1', name: 'Pedro Gómez', email: 'pedro@test.local', supervisorId: 'sup-1' },
];

const openDetail = (row: HTMLElement) => fireEvent.click(within(row).getByRole('button', { name: /detalle/i }));

describe('Prospects (team view: supervisor and admin)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    vi.mocked(prospectRepository.list).mockResolvedValue(rows);
    vi.mocked(prospectRepository.countByStatus).mockResolvedValue({ new: 1, contacted: 0, interested: 1, affiliated: 1, lost: 0 });
    vi.mocked(supervisorRepository.listAdvisors).mockResolvedValue(teamAdvisors);
  });

  it('lists the prospects with the advisor that owns each one', async () => {
    render(<Prospects user={supervisor} title="Mi equipo" />);

    const sofia = await screen.findByTestId('prospect-p-3');
    expect(within(sofia).getByText('Sofía Ruiz')).toBeInTheDocument();
    expect(within(sofia).getByText('Ana Torres')).toBeInTheDocument();
    expect(within(screen.getByTestId('prospect-p-1')).getByText('Pedro Gómez')).toBeInTheDocument();
  });

  it('marks the prospects that came from a survey', async () => {
    vi.mocked(prospectRepository.list).mockResolvedValue([
      build({ id: 'p-1', fullName: 'Laura Pérez' }),
      build({ id: 'p-9', fullName: 'Lead Encuesta', source: 'lead_survey' }),
    ]);
    render(<Prospects user={supervisor} />);
    await screen.findByText('Lead Encuesta');

    expect(within(screen.getByTestId('prospect-p-9')).getByText('Desde encuesta')).toBeInTheDocument();
    expect(within(screen.getByTestId('prospect-p-1')).queryByText('Desde encuesta')).not.toBeInTheDocument();
  });

  it('uses the given title and has no advisor month card', async () => {
    render(<Prospects user={supervisor} title="Mi equipo" />);
    expect(await screen.findByRole('heading', { name: 'Mi equipo' })).toBeInTheDocument();
    expect(screen.queryByTestId('monthly-progress')).not.toBeInTheDocument();
  });

  it('summarizes the pipeline with one count per status, from the server totals (not only the loaded page)', async () => {
    vi.mocked(prospectRepository.countByStatus).mockResolvedValue({ new: 1500, contacted: 0, interested: 1, affiliated: 1, lost: 0 });
    render(<Prospects user={supervisor} />);
    await screen.findByText('Laura Pérez');

    expect(within(screen.getByTestId('summary-new')).getByText('1500')).toBeInTheDocument();
    expect(within(screen.getByTestId('summary-interested')).getByText('1')).toBeInTheDocument();
    expect(within(screen.getByTestId('summary-affiliated')).getByText('1')).toBeInTheDocument();
    expect(within(screen.getByTestId('summary-contacted')).getByText('0')).toBeInTheDocument();
    expect(within(screen.getByTestId('summary-lost')).getByText('0')).toBeInTheDocument();
  });

  it('filters by advisor', async () => {
    render(<Prospects user={supervisor} />);
    await screen.findByText('Laura Pérez');

    fireEvent.change(screen.getByLabelText('Filtrar por asesor'), { target: { value: 'adv-2' } });

    expect(screen.queryByText('Laura Pérez')).not.toBeInTheDocument();
    expect(screen.getByText('Sofía Ruiz')).toBeInTheDocument();
  });

  it('filters by status and searches by name', async () => {
    render(<Prospects user={supervisor} />);
    await screen.findByText('Laura Pérez');

    fireEvent.change(screen.getByLabelText('Filtrar por estado'), { target: { value: 'interested' } });
    expect(screen.getByText('Marcos Díaz')).toBeInTheDocument();
    expect(screen.queryByText('Laura Pérez')).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Filtrar por estado'), { target: { value: 'all' } });
    fireEvent.change(screen.getByLabelText('Buscar prospecto'), { target: { value: 'sofía' } });
    expect(screen.getByText('Sofía Ruiz')).toBeInTheDocument();
    expect(screen.queryByText('Marcos Díaz')).not.toBeInTheDocument();
  });

  it('shows an empty state', async () => {
    vi.mocked(prospectRepository.list).mockResolvedValue([]);
    render(<Prospects user={supervisor} />);
    expect(await screen.findByText(/todavía no hay prospectos/i)).toBeInTheDocument();
  });

  it('shows a message when loading fails', async () => {
    vi.mocked(prospectRepository.list).mockRejectedValue(new Error('boom'));
    render(<Prospects user={supervisor} />);
    expect(await screen.findByRole('alert')).toHaveTextContent(/no se pudieron cargar/i);
  });

  describe('supervisor actions on the team (S1)', () => {
    it('reads only the supervisor\'s own team as the advisors to pick from', async () => {
      render(<Prospects user={supervisor} />);
      await screen.findByText('Laura Pérez');

      expect(supervisorRepository.listAdvisors).toHaveBeenCalledWith({ supervisorId: 'sup-1' });
    });

    it('changes the status of a team prospect and moves the counts', async () => {
      vi.mocked(prospectRepository.update).mockResolvedValue(build({ id: 'p-1', status: 'contacted', lastContactAt: '2026-11-11T10:00:00Z' }));
      render(<Prospects user={supervisor} />);
      await screen.findByText('Laura Pérez');

      fireEvent.change(within(screen.getByTestId('prospect-p-1')).getByLabelText('Estado'), { target: { value: 'contacted' } });

      await waitFor(() => expect(prospectRepository.update).toHaveBeenCalledWith('p-1', { status: 'contacted', lastContactAt: expect.any(String) }));
      await waitFor(() => expect(within(screen.getByTestId('summary-contacted')).getByText('1')).toBeInTheDocument());
      expect(within(screen.getByTestId('summary-new')).getByText('0')).toBeInTheDocument();
    });

    it('registers a contact on a team prospect', async () => {
      vi.mocked(prospectRepository.update).mockResolvedValue(build({ id: 'p-1', lastContactAt: '2026-11-11T10:00:00Z' }));
      render(<Prospects user={supervisor} />);
      const laura = await screen.findByTestId('prospect-p-1');

      openDetail(laura);
      fireEvent.click(within(laura).getByRole('button', { name: /registrar contacto/i }));

      await waitFor(() => expect(prospectRepository.update).toHaveBeenCalledWith('p-1', { lastContactAt: expect.any(String) }));
    });

    it('edits the data and notes of a team prospect', async () => {
      vi.mocked(prospectRepository.update).mockResolvedValue(build({ id: 'p-1', fullName: 'Laura P. Gómez', notes: 'Llamar a la tarde' }));
      render(<Prospects user={supervisor} />);
      const laura = await screen.findByTestId('prospect-p-1');

      openDetail(laura);
      fireEvent.click(within(laura).getByRole('button', { name: /editar/i }));
      fireEvent.change(within(laura).getByLabelText('Nombre y apellido'), { target: { value: 'Laura P. Gómez' } });
      fireEvent.change(within(laura).getByLabelText('Notas'), { target: { value: 'Llamar a la tarde' } });
      fireEvent.click(within(laura).getByRole('button', { name: /guardar cambios/i }));

      await waitFor(() => expect(prospectRepository.update).toHaveBeenCalledWith('p-1', {
        fullName: 'Laura P. Gómez',
        phone: '3875111222',
        email: '',
        notes: 'Llamar a la tarde',
      }));
      expect(await screen.findByText('Laura P. Gómez')).toBeInTheDocument();
    });

    it('reassigns a prospect only to another advisor of the team', async () => {
      vi.mocked(prospectRepository.update).mockResolvedValue(build({ id: 'p-1', advisorId: 'adv-2', advisorName: 'Ana Torres' }));
      render(<Prospects user={supervisor} />);
      const laura = await screen.findByTestId('prospect-p-1');

      openDetail(laura);
      const reassign = within(laura).getByLabelText('Reasignar a');
      const options = within(reassign).getAllByRole('option').map((o) => (o as HTMLOptionElement).value).filter(Boolean);
      expect(options).toEqual(['adv-2']);

      fireEvent.change(reassign, { target: { value: 'adv-2' } });

      await waitFor(() => expect(prospectRepository.update).toHaveBeenCalledWith('p-1', { advisorId: 'adv-2' }));
      expect(await within(screen.getByTestId('prospect-p-1')).findByText('Ana Torres')).toBeInTheDocument();
    });

    it('creates a prospect for the advisor of the team the supervisor picks', async () => {
      vi.mocked(prospectRepository.create).mockResolvedValue(build({ id: 'p-7', fullName: 'Nuevo Cliente', advisorId: 'adv-2', advisorName: 'Ana Torres' }));
      render(<Prospects user={supervisor} />);
      await screen.findByText('Laura Pérez');

      fireEvent.click(screen.getByRole('button', { name: /nuevo prospecto/i }));
      const picker = screen.getByLabelText('Asesor');
      expect(within(picker).getAllByRole('option').map((o) => (o as HTMLOptionElement).value).filter(Boolean)).toEqual(['adv-2', 'adv-1']);
      fireEvent.change(picker, { target: { value: 'adv-2' } });
      fireEvent.change(screen.getByLabelText('Nombre y apellido'), { target: { value: 'Nuevo Cliente' } });
      fireEvent.click(screen.getByRole('button', { name: /guardar prospecto/i }));

      await waitFor(() => expect(prospectRepository.create).toHaveBeenCalledWith('adv-2', {
        fullName: 'Nuevo Cliente',
        phone: '',
        email: '',
        notes: '',
      }));
      expect(await screen.findByText('Nuevo Cliente')).toBeInTheDocument();
      expect(within(screen.getByTestId('summary-new')).getByText('2')).toBeInTheDocument();
    });

    it('asks for the advisor before creating a prospect', async () => {
      render(<Prospects user={supervisor} />);
      await screen.findByText('Laura Pérez');

      fireEvent.click(screen.getByRole('button', { name: /nuevo prospecto/i }));
      fireEvent.change(screen.getByLabelText('Nombre y apellido'), { target: { value: 'Nuevo Cliente' } });
      fireEvent.click(screen.getByRole('button', { name: /guardar prospecto/i }));

      expect(await screen.findByText(/elegí el asesor/i)).toBeInTheDocument();
      expect(prospectRepository.create).not.toHaveBeenCalled();
    });

    it('cannot delete prospects', async () => {
      render(<Prospects user={supervisor} />);
      const laura = await screen.findByTestId('prospect-p-1');

      openDetail(laura);
      expect(within(laura).queryByRole('button', { name: /eliminar/i })).not.toBeInTheDocument();
    });
  });

  it('the admin picks among every advisor (no team filter)', async () => {
    render(<Prospects user={admin} title="Prospectos comerciales" />);
    await screen.findByText('Laura Pérez');

    expect(supervisorRepository.listAdvisors).toHaveBeenCalledWith({});
    openDetail(screen.getByTestId('prospect-p-1'));
    expect(within(screen.getByTestId('prospect-p-1')).getByLabelText('Reasignar a')).toBeInTheDocument();
  });

  describe('pagination', () => {
    const page = (from: number, n: number) =>
      Array.from({ length: n }, (_, i) => build({ id: `p-${from + i}`, fullName: `Prospecto ${from + i}` }));

    it('loads 100 at a time and appends the next page with "Cargar más"', async () => {
      vi.mocked(prospectRepository.list).mockResolvedValueOnce(page(0, 100)).mockResolvedValueOnce(page(100, 5));
      render(<Prospects user={supervisor} />);
      await screen.findByText('Prospecto 0');
      expect(prospectRepository.list).toHaveBeenCalledWith({ limit: 100, offset: 0 });

      fireEvent.click(screen.getByText('Cargar más'));

      expect(await screen.findByText('Prospecto 104')).toBeInTheDocument();
      expect(prospectRepository.list).toHaveBeenLastCalledWith({ limit: 100, offset: 100 });
      expect(screen.queryByText('Cargar más')).not.toBeInTheDocument();
    });

    it('keeps the loaded prospects when the next page fails', async () => {
      vi.mocked(prospectRepository.list).mockResolvedValueOnce(page(0, 100)).mockRejectedValueOnce(new Error('boom'));
      render(<Prospects user={supervisor} />);
      await screen.findByText('Prospecto 0');

      fireEvent.click(screen.getByText('Cargar más'));

      expect(await screen.findByText(/no se pudieron cargar más/i)).toBeInTheDocument();
      expect(screen.getByText('Prospecto 99')).toBeInTheDocument();
    });
  });

  it('still lists the prospects when the advisor list cannot be read, and says so', async () => {
    vi.mocked(supervisorRepository.listAdvisors).mockRejectedValue(new Error('denied'));
    render(<Prospects user={supervisor} />);

    const sofia = await screen.findByTestId('prospect-p-3');
    expect(within(sofia).getByText('Ana Torres')).toBeInTheDocument();
    expect(screen.getByText('No se pudo cargar la lista de asesores.')).toBeInTheDocument();
    expect(screen.queryByText('No se pudieron cargar los prospectos.')).not.toBeInTheDocument();
  });
});

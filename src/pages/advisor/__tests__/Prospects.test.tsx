import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Prospects } from '../Prospects';
import { prospectRepository } from '../../../repositories/ProspectRepository';
import { Prospect, User } from '../../../types';

vi.mock('../../../repositories/ProspectRepository', () => ({
  prospectRepository: {
    list: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
  },
}));

vi.mock('../MonthlyProgress', () => ({
  MonthlyProgress: () => <div data-testid="monthly-progress" />,
}));

const user: User = { id: 'adv-1', name: 'Pedro Gómez', email: 'pedro@test.local', role: 'advisor' };

const build = (over: Partial<Prospect> = {}): Prospect => ({
  id: 'p-1',
  advisorId: 'adv-1',
  fullName: 'Laura Pérez',
  phone: '3875111222',
  status: 'new',
  source: 'manual',
  createdAt: '2026-11-01T12:00:00Z',
  updatedAt: '2026-11-01T12:00:00Z',
  ...over,
});

describe('Prospects (advisor CRM)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prospectRepository.list).mockResolvedValue([
      build(),
      build({ id: 'p-2', fullName: 'Marcos Díaz', status: 'interested', phone: undefined }),
    ]);
    vi.spyOn(window, 'confirm').mockReturnValue(true);
  });

  it('lists the advisor prospects with their pipeline status', async () => {
    render(<Prospects user={user} />);

    expect(await screen.findByText('Laura Pérez')).toBeInTheDocument();
    expect(screen.getByText('Marcos Díaz')).toBeInTheDocument();
    expect(prospectRepository.list).toHaveBeenCalledTimes(1);
    expect(within(screen.getByTestId('prospect-p-1')).getByLabelText('Estado')).toHaveValue('new');
    expect(within(screen.getByTestId('prospect-p-2')).getByLabelText('Estado')).toHaveValue('interested');
  });

  it('shows the advisor\'s month (goals and metrics) above the prospect list', async () => {
    render(<Prospects user={user} />);
    await screen.findByText('Laura Pérez');

    expect(screen.getByTestId('monthly-progress')).toBeInTheDocument();
  });

  it('marks the prospects that came from a survey and not the manual ones', async () => {
    vi.mocked(prospectRepository.list).mockResolvedValue([
      build({ id: 'p-1', fullName: 'Laura Pérez' }),
      build({ id: 'p-9', fullName: 'Lead Encuesta', source: 'lead_survey', notes: 'Encuesta de opinión. Principal problema: filas' }),
    ]);
    render(<Prospects user={user} />);
    await screen.findByText('Lead Encuesta');

    expect(within(screen.getByTestId('prospect-p-9')).getByText('Desde encuesta')).toBeInTheDocument();
    expect(within(screen.getByTestId('prospect-p-1')).queryByText('Desde encuesta')).not.toBeInTheDocument();
  });

  it('shows an empty state when there are no prospects', async () => {
    vi.mocked(prospectRepository.list).mockResolvedValue([]);
    render(<Prospects user={user} />);

    expect(await screen.findByText(/todavía no cargaste prospectos/i)).toBeInTheDocument();
  });

  it('shows a message when loading fails', async () => {
    vi.mocked(prospectRepository.list).mockRejectedValue(new Error('boom'));
    render(<Prospects user={user} />);

    expect(await screen.findByRole('alert')).toHaveTextContent(/no se pudieron cargar/i);
  });

  it('adds a prospect for the logged advisor and shows it', async () => {
    vi.mocked(prospectRepository.create).mockResolvedValue(build({ id: 'p-3', fullName: 'Nuevo Cliente' }));
    render(<Prospects user={user} />);
    await screen.findByText('Laura Pérez');

    fireEvent.click(screen.getByRole('button', { name: /nuevo prospecto/i }));
    fireEvent.change(screen.getByLabelText('Nombre y apellido'), { target: { value: 'Nuevo Cliente' } });
    fireEvent.change(screen.getByLabelText('Teléfono'), { target: { value: '3875000000' } });
    fireEvent.click(screen.getByRole('button', { name: /guardar prospecto/i }));

    await waitFor(() => expect(prospectRepository.create).toHaveBeenCalledWith('adv-1', {
      fullName: 'Nuevo Cliente',
      phone: '3875000000',
      email: '',
      notes: '',
    }));
    expect(await screen.findByText('Nuevo Cliente')).toBeInTheDocument();
  });

  it('requires a name before saving', async () => {
    render(<Prospects user={user} />);
    await screen.findByText('Laura Pérez');

    fireEvent.click(screen.getByRole('button', { name: /nuevo prospecto/i }));
    fireEvent.click(screen.getByRole('button', { name: /guardar prospecto/i }));

    expect(await screen.findByText(/el nombre es obligatorio/i)).toBeInTheDocument();
    expect(prospectRepository.create).not.toHaveBeenCalled();
  });

  it('moves a prospect through the pipeline and stamps the contact date when contacted', async () => {
    vi.mocked(prospectRepository.update).mockResolvedValue(build({ status: 'contacted' }));
    render(<Prospects user={user} />);
    await screen.findByText('Laura Pérez');

    fireEvent.change(within(screen.getByTestId('prospect-p-1')).getByLabelText('Estado'), { target: { value: 'contacted' } });

    await waitFor(() => expect(prospectRepository.update).toHaveBeenCalledWith('p-1', {
      status: 'contacted',
      lastContactAt: expect.any(String),
    }));
    expect(within(screen.getByTestId('prospect-p-1')).getByLabelText('Estado')).toHaveValue('contacted');
  });

  it('does not stamp a contact date for the other statuses', async () => {
    vi.mocked(prospectRepository.update).mockResolvedValue(build({ status: 'lost' }));
    render(<Prospects user={user} />);
    await screen.findByText('Laura Pérez');

    fireEvent.change(within(screen.getByTestId('prospect-p-1')).getByLabelText('Estado'), { target: { value: 'lost' } });

    await waitFor(() => expect(prospectRepository.update).toHaveBeenCalledWith('p-1', { status: 'lost' }));
  });

  it('registers a contact without changing the status', async () => {
    vi.mocked(prospectRepository.update).mockResolvedValue(build({ lastContactAt: '2026-11-11T10:00:00Z' }));
    render(<Prospects user={user} />);
    await screen.findByText('Laura Pérez');

    fireEvent.click(within(screen.getByTestId('prospect-p-1')).getByRole('button', { name: /registrar contacto/i }));

    await waitFor(() => expect(prospectRepository.update).toHaveBeenCalledWith('p-1', {
      lastContactAt: expect.any(String),
    }));
  });

  it('deletes a prospect after confirming', async () => {
    vi.mocked(prospectRepository.remove).mockResolvedValue(undefined);
    render(<Prospects user={user} />);
    await screen.findByText('Laura Pérez');

    fireEvent.click(within(screen.getByTestId('prospect-p-1')).getByRole('button', { name: /eliminar/i }));

    await waitFor(() => expect(prospectRepository.remove).toHaveBeenCalledWith('p-1'));
    await waitFor(() => expect(screen.queryByText('Laura Pérez')).not.toBeInTheDocument());
  });

  it('keeps the prospect when the deletion is not confirmed', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    render(<Prospects user={user} />);
    await screen.findByText('Laura Pérez');

    fireEvent.click(within(screen.getByTestId('prospect-p-1')).getByRole('button', { name: /eliminar/i }));

    expect(prospectRepository.remove).not.toHaveBeenCalled();
    expect(screen.getByText('Laura Pérez')).toBeInTheDocument();
  });

  it('filters by pipeline status', async () => {
    render(<Prospects user={user} />);
    await screen.findByText('Laura Pérez');

    fireEvent.change(screen.getByLabelText('Filtrar por estado'), { target: { value: 'interested' } });

    expect(screen.queryByText('Laura Pérez')).not.toBeInTheDocument();
    expect(screen.getByText('Marcos Díaz')).toBeInTheDocument();
  });

  it('searches by name', async () => {
    render(<Prospects user={user} />);
    await screen.findByText('Laura Pérez');

    fireEvent.change(screen.getByLabelText('Buscar prospecto'), { target: { value: 'marcos' } });

    expect(screen.queryByText('Laura Pérez')).not.toBeInTheDocument();
    expect(screen.getByText('Marcos Díaz')).toBeInTheDocument();
  });
});

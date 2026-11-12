import { render, screen, fireEvent, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TeamProspects } from '../TeamProspects';
import { prospectRepository } from '../../../repositories/ProspectRepository';
import { Prospect } from '../../../types';

vi.mock('../../../repositories/ProspectRepository', () => ({
  prospectRepository: { list: vi.fn() },
}));

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
  build({ id: 'p-1', fullName: 'Laura Pérez', status: 'new' }),
  build({ id: 'p-2', fullName: 'Marcos Díaz', status: 'interested', lastContactAt: '2026-11-10T12:00:00Z' }),
  build({ id: 'p-3', fullName: 'Sofía Ruiz', status: 'affiliated', advisorId: 'adv-2', advisorName: 'Ana Torres' }),
];

describe('TeamProspects (supervisor / admin, read-only)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prospectRepository.list).mockResolvedValue(rows);
  });

  it('lists the prospects with the advisor that owns each one', async () => {
    render(<TeamProspects />);

    const sofia = await screen.findByTestId('team-prospect-p-3');
    expect(within(sofia).getByText('Sofía Ruiz')).toBeInTheDocument();
    expect(within(sofia).getByText('Ana Torres')).toBeInTheDocument();
    expect(within(screen.getByTestId('team-prospect-p-1')).getByText('Pedro Gómez')).toBeInTheDocument();
  });

  it('marks the prospects that came from a survey', async () => {
    vi.mocked(prospectRepository.list).mockResolvedValue([
      build({ id: 'p-1', fullName: 'Laura Pérez' }),
      build({ id: 'p-9', fullName: 'Lead Encuesta', source: 'lead_survey' }),
    ]);
    render(<TeamProspects />);
    await screen.findByText('Lead Encuesta');

    expect(within(screen.getByTestId('team-prospect-p-9')).getByText('Desde encuesta')).toBeInTheDocument();
    expect(within(screen.getByTestId('team-prospect-p-1')).queryByText('Desde encuesta')).not.toBeInTheDocument();
  });

  it('uses the given title', async () => {
    render(<TeamProspects title="Prospectos del equipo" />);
    expect(await screen.findByRole('heading', { name: 'Prospectos del equipo' })).toBeInTheDocument();
  });

  it('summarizes the pipeline with one count per status', async () => {
    render(<TeamProspects />);
    await screen.findByText('Laura Pérez');

    expect(within(screen.getByTestId('summary-new')).getByText('1')).toBeInTheDocument();
    expect(within(screen.getByTestId('summary-interested')).getByText('1')).toBeInTheDocument();
    expect(within(screen.getByTestId('summary-affiliated')).getByText('1')).toBeInTheDocument();
    expect(within(screen.getByTestId('summary-contacted')).getByText('0')).toBeInTheDocument();
    expect(within(screen.getByTestId('summary-lost')).getByText('0')).toBeInTheDocument();
  });

  it('filters by advisor', async () => {
    render(<TeamProspects />);
    await screen.findByText('Laura Pérez');

    fireEvent.change(screen.getByLabelText('Filtrar por asesor'), { target: { value: 'adv-2' } });

    expect(screen.queryByText('Laura Pérez')).not.toBeInTheDocument();
    expect(screen.getByText('Sofía Ruiz')).toBeInTheDocument();
  });

  it('filters by status and searches by name', async () => {
    render(<TeamProspects />);
    await screen.findByText('Laura Pérez');

    fireEvent.change(screen.getByLabelText('Filtrar por estado'), { target: { value: 'interested' } });
    expect(screen.getByText('Marcos Díaz')).toBeInTheDocument();
    expect(screen.queryByText('Laura Pérez')).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Filtrar por estado'), { target: { value: 'all' } });
    fireEvent.change(screen.getByLabelText('Buscar prospecto'), { target: { value: 'sofía' } });
    expect(screen.getByText('Sofía Ruiz')).toBeInTheDocument();
    expect(screen.queryByText('Marcos Díaz')).not.toBeInTheDocument();
  });

  it('is read-only: no status editing and no deletion', async () => {
    render(<TeamProspects />);
    await screen.findByText('Laura Pérez');

    expect(screen.queryByLabelText('Estado')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /eliminar/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /registrar contacto/i })).not.toBeInTheDocument();
  });

  it('shows an empty state', async () => {
    vi.mocked(prospectRepository.list).mockResolvedValue([]);
    render(<TeamProspects />);
    expect(await screen.findByText(/todavía no hay prospectos/i)).toBeInTheDocument();
  });

  it('shows a message when loading fails', async () => {
    vi.mocked(prospectRepository.list).mockRejectedValue(new Error('boom'));
    render(<TeamProspects />);
    expect(await screen.findByRole('alert')).toHaveTextContent(/no se pudieron cargar/i);
  });
});

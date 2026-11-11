import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import SupervisorsAdmin from '../SupervisorsAdmin';
import { supervisorRepository } from '../../../repositories/SupervisorRepository';

vi.mock('../../../repositories/SupervisorRepository', () => ({
  supervisorRepository: {
    listSupervisors: vi.fn(),
    listAdvisors: vi.fn(),
    createSupervisor: vi.fn(),
    assignAdvisor: vi.fn(),
  },
}));

const supervisors = [
  { id: 's-1', name: 'Ana Gómez', email: 'ana@test.local' },
  { id: 's-2', name: 'Bruno Sosa', email: 'bruno@test.local' },
];
const advisors = [
  { id: 'a-1', name: 'Pedro Gómez', email: 'pedro@test.local', supervisorId: 's-1' },
  { id: 'a-2', name: 'Luis Paz', email: 'luis@test.local', supervisorId: null },
];

describe('SupervisorsAdmin', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(supervisorRepository.listSupervisors).mockResolvedValue(supervisors);
    vi.mocked(supervisorRepository.listAdvisors).mockResolvedValue(advisors);
  });

  it('shows every supervisor with the advisors on their team and the unassigned ones apart', async () => {
    render(<SupervisorsAdmin />);

    const ana = await screen.findByTestId('supervisor-s-1');
    expect(within(ana).getByRole('heading', { name: 'Ana Gómez' })).toBeInTheDocument();
    expect(within(ana).getByText('Pedro Gómez')).toBeInTheDocument();
    expect(within(screen.getByTestId('supervisor-s-2')).getByText(/sin asesores/i)).toBeInTheDocument();
    expect(within(screen.getByTestId('unassigned-advisors')).getByText('Luis Paz')).toBeInTheDocument();
  });

  it('assigns an advisor to a supervisor and moves them to that team', async () => {
    vi.mocked(supervisorRepository.assignAdvisor).mockResolvedValue(undefined);
    render(<SupervisorsAdmin />);
    await screen.findByText('Luis Paz');

    fireEvent.change(screen.getByLabelText('Supervisor de Luis Paz'), { target: { value: 's-2' } });

    await waitFor(() => expect(supervisorRepository.assignAdvisor).toHaveBeenCalledWith('a-2', 's-2'));
    await waitFor(() => expect(within(screen.getByTestId('supervisor-s-2')).getByText('Luis Paz')).toBeInTheDocument());
  });

  it('releases an advisor from their supervisor', async () => {
    vi.mocked(supervisorRepository.assignAdvisor).mockResolvedValue(undefined);
    render(<SupervisorsAdmin />);
    await screen.findByText('Pedro Gómez');

    fireEvent.change(screen.getByLabelText('Supervisor de Pedro Gómez'), { target: { value: '' } });

    await waitFor(() => expect(supervisorRepository.assignAdvisor).toHaveBeenCalledWith('a-1', null));
    await waitFor(() => expect(within(screen.getByTestId('unassigned-advisors')).getByText('Pedro Gómez')).toBeInTheDocument());
  });

  it('keeps the advisor where they were and shows the error when the assignment fails', async () => {
    vi.mocked(supervisorRepository.assignAdvisor).mockRejectedValue(new Error('boom'));
    render(<SupervisorsAdmin />);
    await screen.findByText('Luis Paz');

    fireEvent.change(screen.getByLabelText('Supervisor de Luis Paz'), { target: { value: 's-2' } });

    expect(await screen.findByRole('alert')).toHaveTextContent(/no se pudo asignar/i);
    expect(within(screen.getByTestId('unassigned-advisors')).getByText('Luis Paz')).toBeInTheDocument();
  });

  it('creates a supervisor and lists them', async () => {
    vi.mocked(supervisorRepository.createSupervisor).mockResolvedValue('s-3');
    render(<SupervisorsAdmin />);
    await screen.findByRole('heading', { name: 'Ana Gómez' });

    fireEvent.click(screen.getByRole('button', { name: /nuevo supervisor/i }));
    fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: 'Carla' } });
    fireEvent.change(screen.getByLabelText('Apellido'), { target: { value: 'Ibarra' } });
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'carla@test.local' } });
    fireEvent.change(screen.getByLabelText('Contraseña'), { target: { value: 'secret123' } });
    fireEvent.click(screen.getByRole('button', { name: /crear supervisor/i }));

    await waitFor(() => expect(supervisorRepository.createSupervisor).toHaveBeenCalledWith({
      firstName: 'Carla',
      lastName: 'Ibarra',
      email: 'carla@test.local',
      password: 'secret123',
      phone: '',
    }));
    expect(await screen.findByRole('heading', { name: 'Carla Ibarra' })).toBeInTheDocument();
  });

  it('requires the mandatory fields before creating', async () => {
    render(<SupervisorsAdmin />);
    await screen.findByRole('heading', { name: 'Ana Gómez' });

    fireEvent.click(screen.getByRole('button', { name: /nuevo supervisor/i }));
    fireEvent.click(screen.getByRole('button', { name: /crear supervisor/i }));

    expect(await screen.findByText(/completá nombre, apellido, email y contraseña/i)).toBeInTheDocument();
    expect(supervisorRepository.createSupervisor).not.toHaveBeenCalled();
  });

  it('shows the server message when the supervisor cannot be created', async () => {
    vi.mocked(supervisorRepository.createSupervisor).mockRejectedValue(new Error('User already registered'));
    render(<SupervisorsAdmin />);
    await screen.findByRole('heading', { name: 'Ana Gómez' });

    fireEvent.click(screen.getByRole('button', { name: /nuevo supervisor/i }));
    fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: 'Carla' } });
    fireEvent.change(screen.getByLabelText('Apellido'), { target: { value: 'Ibarra' } });
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'ana@test.local' } });
    fireEvent.change(screen.getByLabelText('Contraseña'), { target: { value: 'secret123' } });
    fireEvent.click(screen.getByRole('button', { name: /crear supervisor/i }));

    expect(await screen.findByText('User already registered')).toBeInTheDocument();
  });

  it('shows a message when loading fails', async () => {
    vi.mocked(supervisorRepository.listSupervisors).mockRejectedValue(new Error('boom'));
    render(<SupervisorsAdmin />);
    expect(await screen.findByRole('alert')).toHaveTextContent(/no se pudieron cargar/i);
  });
});

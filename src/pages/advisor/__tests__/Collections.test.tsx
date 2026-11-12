import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Collections } from '../Collections';
import { collectionRepository } from '../../../repositories/CollectionRepository';
import { CollectionAction, CollectionAffiliate } from '../../../types';

vi.mock('../../../repositories/CollectionRepository', () => ({
  collectionRepository: {
    listAffiliates: vi.fn(),
    listActions: vi.fn(),
    createAction: vi.fn(),
  },
}));

const build = (over: Partial<CollectionAffiliate>): CollectionAffiliate => ({
  affiliateId: 'aff-1',
  affiliateName: 'Laura Pérez',
  affiliatePhone: '3875111222',
  advisorId: 'adv-1',
  advisorName: 'Pedro Gómez',
  planName: 'Plan Familiar',
  paymentStatus: 'overdue',
  balance: 1500,
  paidThrough: '2026-10-01T12:00:00Z',
  actionsCount: 0,
  ...over,
});

const affiliates = [
  build({}),
  build({ affiliateId: 'aff-2', affiliateName: 'Marcos Díaz', paymentStatus: 'pending', balance: 800, paidThrough: '2099-01-01T12:00:00Z', lastActionAt: '2026-11-05T12:00:00Z', lastActionType: 'promise', promisedDate: '2026-12-01', actionsCount: 2 }),
  build({ affiliateId: 'aff-3', affiliateName: 'Sofía Ruiz', paymentStatus: 'current', balance: 0, paidThrough: undefined }),
];

const action = (over: Partial<CollectionAction> = {}): CollectionAction => ({
  id: 'act-1',
  affiliateId: 'aff-1',
  actionType: 'call',
  note: 'llamé y no atendió',
  createdBy: 'adv-1',
  createdByName: 'Pedro Gómez',
  createdAt: '2026-11-06T12:00:00Z',
  ...over,
});

describe('Collections (advisor)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(collectionRepository.listAffiliates).mockResolvedValue(affiliates);
    vi.mocked(collectionRepository.listActions).mockResolvedValue([action()]);
  });

  it('lists the affiliates with debt by default, with status, balance and coverage end', async () => {
    render(<Collections />);

    const laura = await screen.findByTestId('collection-aff-1');
    expect(laura).toHaveTextContent('Laura Pérez');
    expect(laura).toHaveTextContent(/en mora/i);
    expect(laura).toHaveTextContent(/1\.500/);
    expect(laura).toHaveTextContent(/1\/10\/2026/);
    expect(screen.getByTestId('collection-aff-2')).toHaveTextContent(/pendiente/i);
    expect(screen.queryByTestId('collection-aff-3')).not.toBeInTheDocument();
  });

  it('summarizes every status and the total owed', async () => {
    render(<Collections />);
    await screen.findByTestId('collection-aff-1');

    expect(within(screen.getByTestId('summary-overdue')).getByText('1')).toBeInTheDocument();
    expect(within(screen.getByTestId('summary-pending')).getByText('1')).toBeInTheDocument();
    expect(within(screen.getByTestId('summary-current')).getByText('1')).toBeInTheDocument();
    expect(screen.getByTestId('summary-debt')).toHaveTextContent(/2\.300/);
  });

  it('shows the last action and the promised payment date', async () => {
    render(<Collections />);
    const marcos = await screen.findByTestId('collection-aff-2');

    expect(marcos).toHaveTextContent(/promesa de pago/i);
    expect(marcos).toHaveTextContent(/1\/12\/2026/);
    expect(marcos).toHaveTextContent(/2 gestiones/i);
    expect(screen.getByTestId('collection-aff-1')).toHaveTextContent(/sin gestiones/i);
  });

  it('filters by status and searches by name', async () => {
    render(<Collections />);
    await screen.findByTestId('collection-aff-1');

    fireEvent.change(screen.getByLabelText('Filtrar por estado'), { target: { value: 'all' } });
    expect(screen.getByTestId('collection-aff-3')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Filtrar por estado'), { target: { value: 'overdue' } });
    expect(screen.queryByTestId('collection-aff-2')).not.toBeInTheDocument();
    expect(screen.getByTestId('collection-aff-1')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Filtrar por estado'), { target: { value: 'all' } });
    fireEvent.change(screen.getByLabelText('Buscar afiliado'), { target: { value: 'sofía' } });
    expect(screen.getByTestId('collection-aff-3')).toBeInTheDocument();
    expect(screen.queryByTestId('collection-aff-1')).not.toBeInTheDocument();
  });

  it('logs a collection action and updates the row', async () => {
    vi.mocked(collectionRepository.createAction).mockResolvedValue(action({ id: 'act-9', note: 'le escribí' , actionType: 'whatsapp' }));
    render(<Collections />);
    const laura = await screen.findByTestId('collection-aff-1');

    fireEvent.click(within(laura).getByRole('button', { name: /registrar gestión/i }));
    fireEvent.change(screen.getByLabelText('Tipo de gestión'), { target: { value: 'whatsapp' } });
    fireEvent.change(screen.getByLabelText('Nota'), { target: { value: 'le escribí' } });
    fireEvent.click(screen.getByRole('button', { name: /guardar gestión/i }));

    await waitFor(() => expect(collectionRepository.createAction).toHaveBeenCalledWith('aff-1', {
      actionType: 'whatsapp',
      note: 'le escribí',
      promisedDate: undefined,
    }));
    await waitFor(() => expect(within(screen.getByTestId('collection-aff-1')).getByText(/1 gestión/i)).toBeInTheDocument());
    expect(screen.queryByLabelText('Tipo de gestión')).not.toBeInTheDocument();
  });

  it('asks for a date when the action is a promise to pay and stores it', async () => {
    vi.mocked(collectionRepository.createAction).mockResolvedValue(action({ actionType: 'promise', promisedDate: '2026-12-10', note: undefined }));
    render(<Collections />);
    const laura = await screen.findByTestId('collection-aff-1');

    fireEvent.click(within(laura).getByRole('button', { name: /registrar gestión/i }));
    expect(screen.queryByLabelText('Fecha prometida')).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Tipo de gestión'), { target: { value: 'promise' } });
    fireEvent.change(screen.getByLabelText('Fecha prometida'), { target: { value: '2026-12-10' } });
    fireEvent.click(screen.getByRole('button', { name: /guardar gestión/i }));

    await waitFor(() => expect(collectionRepository.createAction).toHaveBeenCalledWith('aff-1', {
      actionType: 'promise',
      note: '',
      promisedDate: '2026-12-10',
    }));
    await waitFor(() => expect(within(screen.getByTestId('collection-aff-1')).getByText(/10\/12\/2026/)).toBeInTheDocument());
  });

  it('shows the validation message and keeps the form open when the action is rejected', async () => {
    vi.mocked(collectionRepository.createAction).mockRejectedValue(new Error('Indicá la fecha prometida de pago.'));
    render(<Collections />);
    const laura = await screen.findByTestId('collection-aff-1');

    fireEvent.click(within(laura).getByRole('button', { name: /registrar gestión/i }));
    fireEvent.change(screen.getByLabelText('Tipo de gestión'), { target: { value: 'promise' } });
    fireEvent.click(screen.getByRole('button', { name: /guardar gestión/i }));

    expect(await screen.findByText(/indicá la fecha prometida/i)).toBeInTheDocument();
    expect(screen.getByLabelText('Tipo de gestión')).toBeInTheDocument();
  });

  it('closes the form without saving when cancelled', async () => {
    render(<Collections />);
    const laura = await screen.findByTestId('collection-aff-1');

    fireEvent.click(within(laura).getByRole('button', { name: /registrar gestión/i }));
    fireEvent.click(screen.getByRole('button', { name: /cancelar/i }));

    expect(screen.queryByLabelText('Tipo de gestión')).not.toBeInTheDocument();
    expect(collectionRepository.createAction).not.toHaveBeenCalled();
  });

  it('shows the history of an affiliate', async () => {
    render(<Collections />);
    const laura = await screen.findByTestId('collection-aff-1');

    fireEvent.click(within(laura).getByRole('button', { name: /ver historial/i }));

    await waitFor(() => expect(collectionRepository.listActions).toHaveBeenCalledWith('aff-1'));
    expect(await screen.findByText(/llamé y no atendió/i)).toBeInTheDocument();
    expect(within(screen.getByTestId('history-aff-1')).getByText(/llamada/i)).toBeInTheDocument();
  });

  it('shows an empty state when there are no affiliates', async () => {
    vi.mocked(collectionRepository.listAffiliates).mockResolvedValue([]);
    render(<Collections />);
    expect(await screen.findByText(/todavía no hay afiliados para seguir/i)).toBeInTheDocument();
  });

  it('says so when the filter leaves nothing', async () => {
    vi.mocked(collectionRepository.listAffiliates).mockResolvedValue([build({ paymentStatus: 'current', balance: 0 })]);
    render(<Collections />);
    expect(await screen.findByText(/no hay afiliados para ese filtro/i)).toBeInTheDocument();
  });

  it('shows a message when loading fails', async () => {
    vi.mocked(collectionRepository.listAffiliates).mockRejectedValue(new Error('boom'));
    render(<Collections />);
    expect(await screen.findByRole('alert')).toHaveTextContent(/no se pudieron cargar/i);
  });

  it('has no advisor filter or per-advisor summary: an advisor only sees their own affiliates', async () => {
    render(<Collections />);
    await screen.findByTestId('collection-aff-1');

    expect(screen.queryByLabelText('Filtrar por asesor')).not.toBeInTheDocument();
    expect(screen.queryByTestId('advisor-summary-adv-1')).not.toBeInTheDocument();
  });
});

describe('Collections (read-only team view for supervisors and admins)', () => {
  const team = [
    build({}),
    build({ affiliateId: 'aff-2', affiliateName: 'Marcos Díaz', paymentStatus: 'pending', balance: 800 }),
    build({ affiliateId: 'aff-4', affiliateName: 'Ana Torres', advisorId: 'adv-2', advisorName: 'Luis Paz', paymentStatus: 'overdue', balance: 500 }),
    build({ affiliateId: 'aff-5', affiliateName: 'Bruno Sosa', advisorId: 'adv-2', advisorName: 'Luis Paz', paymentStatus: 'current', balance: 0 }),
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(collectionRepository.listAffiliates).mockResolvedValue(team);
    vi.mocked(collectionRepository.listActions).mockResolvedValue([action()]);
  });

  it('shows the advisor that owns each affiliate', async () => {
    render(<Collections readOnly title="Cobranzas del equipo" />);

    expect(await screen.findByRole('heading', { name: 'Cobranzas del equipo' })).toBeInTheDocument();
    expect(within(await screen.findByTestId('collection-aff-1')).getByText('Pedro Gómez')).toBeInTheDocument();
    expect(within(screen.getByTestId('collection-aff-4')).getByText('Luis Paz')).toBeInTheDocument();
  });

  it('is read-only: no way to log actions, but the history is available', async () => {
    render(<Collections readOnly />);
    const laura = await screen.findByTestId('collection-aff-1');

    expect(screen.queryByRole('button', { name: /registrar gestión/i })).not.toBeInTheDocument();

    fireEvent.click(within(laura).getByRole('button', { name: /ver historial/i }));
    expect(await screen.findByText(/llamé y no atendió/i)).toBeInTheDocument();
  });

  it('summarizes the situation of each advisor, whatever the status', async () => {
    render(<Collections readOnly />);
    await screen.findByTestId('collection-aff-1');

    const pedro = screen.getByTestId('advisor-summary-adv-1');
    expect(pedro).toHaveTextContent('Pedro Gómez');
    expect(pedro).toHaveTextContent(/en mora: 1/i);
    expect(pedro).toHaveTextContent(/pendientes: 1/i);
    expect(pedro).toHaveTextContent(/al día: 0/i);
    expect(pedro).toHaveTextContent(/2\.300/);

    const luis = screen.getByTestId('advisor-summary-adv-2');
    expect(luis).toHaveTextContent(/en mora: 1/i);
    expect(luis).toHaveTextContent(/al día: 1/i);
    expect(luis).toHaveTextContent(/500/);
  });

  it('filters by advisor', async () => {
    render(<Collections readOnly />);
    await screen.findByTestId('collection-aff-1');

    fireEvent.change(screen.getByLabelText('Filtrar por asesor'), { target: { value: 'adv-2' } });

    expect(screen.queryByTestId('collection-aff-1')).not.toBeInTheDocument();
    expect(screen.getByTestId('collection-aff-4')).toBeInTheDocument();
  });
});

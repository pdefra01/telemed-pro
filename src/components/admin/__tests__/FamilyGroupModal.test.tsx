import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { FamilyGroupModal } from '../FamilyGroupModal';
import { familyMemberRepository } from '../../../repositories/FamilyMemberRepository';

vi.mock('../../../repositories/FamilyMemberRepository', () => ({
  familyMemberRepository: {
    getByFamilyGroup: vi.fn(),
    findFamilyGroupId: vi.fn(),
    ensureFamilyGroup: vi.fn(),
    addMember: vi.fn(),
    updateMember: vi.fn(),
    removeMember: vi.fn(),
  },
}));

const members = [
  { id: 'm1', name: 'Lucía Pérez', relation: 'hijo/a', age: 8, dni: '55111222', birthDate: '2018-03-09' },
  { id: 'm2', name: 'Raúl Pérez', relation: 'cónyuge', age: 40, dni: '30111222', birthDate: '1985-12-01' },
];

const renderModal = (familyGroupId?: string) =>
  render(<FamilyGroupModal patientId="p1" patientName="Marta Pérez" familyGroupId={familyGroupId} onClose={vi.fn()} />);

const fillForm = (v: { name?: string; relation?: string; birth?: string; dni?: string }) => {
  if (v.name !== undefined) fireEvent.change(screen.getByLabelText('Nombre completo'), { target: { value: v.name } });
  if (v.relation !== undefined) fireEvent.change(screen.getByLabelText('Parentesco'), { target: { value: v.relation } });
  if (v.birth !== undefined) fireEvent.change(screen.getByLabelText('Fecha de nacimiento'), { target: { value: v.birth } });
  if (v.dni !== undefined) fireEvent.change(screen.getByLabelText('DNI'), { target: { value: v.dni } });
};

describe('FamilyGroupModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(familyMemberRepository.getByFamilyGroup).mockResolvedValue(members);
    vi.mocked(familyMemberRepository.findFamilyGroupId).mockResolvedValue(undefined);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('lists the members of the group with relation, DNI and birth date', async () => {
    renderModal('g1');
    expect(await screen.findByText('Lucía Pérez')).toBeInTheDocument();
    expect(familyMemberRepository.getByFamilyGroup).toHaveBeenCalledWith('g1');
    expect(screen.getByText('Raúl Pérez')).toBeInTheDocument();
    expect(screen.getByText(/55111222/)).toBeInTheDocument();
    expect(screen.getByText(/09\/03\/2018/)).toBeInTheDocument();
  });

  it('shows an empty state without querying when the affiliate has no group', async () => {
    renderModal(undefined);
    expect(await screen.findByText('Este afiliado no tiene integrantes cargados.')).toBeInTheDocument();
    expect(familyMemberRepository.getByFamilyGroup).not.toHaveBeenCalled();
  });

  it('adds a member to the existing group and refreshes the list', async () => {
    vi.mocked(familyMemberRepository.addMember).mockResolvedValue(members[0]);
    renderModal('g1');
    await screen.findByText('Lucía Pérez');
    fillForm({ name: 'Tomás Pérez', relation: 'hijo/a', birth: '2020-01-05', dni: '56111222' });
    fireEvent.click(screen.getByRole('button', { name: 'Agregar integrante' }));

    await waitFor(() => expect(familyMemberRepository.addMember).toHaveBeenCalledWith('g1', {
      fullName: 'Tomás Pérez', relation: 'hijo/a', birthDate: '2020-01-05', dni: '56111222',
    }));
    await waitFor(() => expect(familyMemberRepository.getByFamilyGroup).toHaveBeenCalledTimes(2));
  });

  it('finds the real group when the page still has a stale list without it', async () => {
    vi.mocked(familyMemberRepository.findFamilyGroupId).mockResolvedValue('g9');
    renderModal(undefined);
    expect(await screen.findByText('Lucía Pérez')).toBeInTheDocument();
    expect(familyMemberRepository.findFamilyGroupId).toHaveBeenCalledWith('p1');
    expect(familyMemberRepository.getByFamilyGroup).toHaveBeenCalledWith('g9');
  });

  it('warns that removing a member drops the family tag of their studies', async () => {
    const confirm = vi.fn().mockReturnValue(false);
    vi.stubGlobal('confirm', confirm);
    renderModal('g1');
    fireEvent.click(await screen.findByRole('button', { name: 'Quitar Raúl Pérez' }));
    expect(confirm).toHaveBeenCalledWith(expect.stringContaining('estudios'));
  });

  it('creates the group first when the affiliate has none', async () => {
    vi.mocked(familyMemberRepository.ensureFamilyGroup).mockResolvedValue('g-new');
    vi.mocked(familyMemberRepository.addMember).mockResolvedValue(members[0]);
    vi.mocked(familyMemberRepository.getByFamilyGroup).mockResolvedValue([]);
    renderModal(undefined);
    await screen.findByText('Este afiliado no tiene integrantes cargados.');
    fillForm({ name: 'Tomás Pérez', relation: 'hijo/a' });
    fireEvent.click(screen.getByRole('button', { name: 'Agregar integrante' }));

    await waitFor(() => expect(familyMemberRepository.ensureFamilyGroup).toHaveBeenCalledWith('p1'));
    expect(familyMemberRepository.addMember).toHaveBeenCalledWith('g-new', expect.objectContaining({ fullName: 'Tomás Pérez' }));
  });

  it('requires a name before adding', async () => {
    renderModal('g1');
    await screen.findByText('Lucía Pérez');
    fireEvent.click(screen.getByRole('button', { name: 'Agregar integrante' }));
    expect(await screen.findByText('El nombre es obligatorio.')).toBeInTheDocument();
    expect(familyMemberRepository.addMember).not.toHaveBeenCalled();
  });

  it('edits a member with the form prefilled', async () => {
    vi.mocked(familyMemberRepository.updateMember).mockResolvedValue(members[0]);
    renderModal('g1');
    fireEvent.click(await screen.findByRole('button', { name: 'Editar Lucía Pérez' }));
    expect(screen.getByLabelText('Nombre completo')).toHaveValue('Lucía Pérez');
    fillForm({ name: 'Lucía M. Pérez' });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));

    await waitFor(() => expect(familyMemberRepository.updateMember).toHaveBeenCalledWith('m1', {
      fullName: 'Lucía M. Pérez', relation: 'hijo/a', birthDate: '2018-03-09', dni: '55111222',
    }));
  });

  it('removes a member only after confirming', async () => {
    vi.mocked(familyMemberRepository.removeMember).mockResolvedValue();
    const confirm = vi.fn().mockReturnValueOnce(false).mockReturnValueOnce(true);
    vi.stubGlobal('confirm', confirm);
    renderModal('g1');
    const remove = await screen.findByRole('button', { name: 'Quitar Raúl Pérez' });

    fireEvent.click(remove);
    expect(familyMemberRepository.removeMember).not.toHaveBeenCalled();

    fireEvent.click(remove);
    await waitFor(() => expect(familyMemberRepository.removeMember).toHaveBeenCalledWith('m2'));
  });

  it('shows the server error, e.g. a DNI that already belongs to another affiliate', async () => {
    vi.mocked(familyMemberRepository.addMember).mockRejectedValue(new Error('El DNI 55111222 ya pertenece a otro afiliado o grupo familiar.'));
    renderModal('g1');
    await screen.findByText('Lucía Pérez');
    fillForm({ name: 'Tomás Pérez', dni: '55111222' });
    fireEvent.click(screen.getByRole('button', { name: 'Agregar integrante' }));

    expect(await screen.findByText('El DNI 55111222 ya pertenece a otro afiliado o grupo familiar.')).toBeInTheDocument();
  });
});

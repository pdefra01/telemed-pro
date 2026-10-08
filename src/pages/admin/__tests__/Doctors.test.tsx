import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Doctors from '../Doctors';
import { doctorRepository } from '../../../repositories/DoctorRepository';

const toastMock = vi.fn();

vi.mock('../../../context/ToastContext', () => ({
  useToast: () => ({ toast: toastMock }),
}));

vi.mock('../../../repositories/DoctorRepository', () => ({
  doctorRepository: {
    getAllDoctors: vi.fn(),
    createDoctor: vi.fn(),
    updateDoctor: vi.fn(),
    deactivateDoctor: vi.fn(),
  },
}));

vi.mock('../../../services/supabase', () => {
  const chain: any = {
    select: () => chain,
    gte: () => chain,
    lte: () => Promise.resolve({ count: 0 }),
  };
  return { supabase: { from: () => chain } };
});

vi.mock('../../../components/admin/ResetPasswordModal', () => ({ default: () => null }));

const LUCIA = {
  id: 'doc-lucia',
  name: 'Lucía Fernández',
  email: 'lucia@medinex.com',
  role: 'doctor' as const,
  specialty: 'Clínica Médica',
  rating: 5,
  reviewCount: 0,
  isVerified: true,
  availability: [],
  professionalTitle: 'Dra.' as const,
};

const renderPage = () =>
  render(
    <MemoryRouter>
      <Doctors />
    </MemoryRouter>
  );

describe('Doctors admin — professional title', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(doctorRepository.getAllDoctors).mockResolvedValue([LUCIA]);
    vi.mocked(doctorRepository.createDoctor).mockResolvedValue(LUCIA);
    vi.mocked(doctorRepository.updateDoctor).mockResolvedValue(LUCIA);
  });

  it('offers Dr./Dra. with Dr. selected by default when creating a doctor', async () => {
    renderPage();
    fireEvent.click(await screen.findByText('Nuevo Médico'));

    const select = screen.getByLabelText('Título') as HTMLSelectElement;
    expect(select.value).toBe('Dr.');
    expect([...select.options].map((o) => o.value)).toEqual(['Dr.', 'Dra.']);
  });

  it('sends the chosen title when creating a doctor', async () => {
    const { container } = renderPage();
    fireEvent.click(await screen.findByText('Nuevo Médico'));

    fireEvent.change(screen.getByLabelText('Título'), { target: { value: 'Dra.' } });
    fireEvent.change(screen.getByPlaceholderText('Ej: Alejandro Magno'), { target: { value: 'Lucía Fernández' } });
    fireEvent.change(screen.getByPlaceholderText('medico@medinex.com.ar'), { target: { value: 'lucia@medinex.com' } });
    fireEvent.change(screen.getByPlaceholderText('Mínimo 6 caracteres'), { target: { value: 'secreto123' } });
    fireEvent.submit(container.ownerDocument.querySelector('form')!);

    await waitFor(() => expect(doctorRepository.createDoctor).toHaveBeenCalled());
    expect(vi.mocked(doctorRepository.createDoctor).mock.calls[0][0]).toMatchObject({
      name: 'Lucía Fernández',
      professionalTitle: 'Dra.',
    });
    await waitFor(() => expect(toastMock).toHaveBeenCalledWith('Ficha de Dra. Lucía Fernández registrada', 'success'));
  });

  it('loads the stored title when editing and sends the changed one', async () => {
    const { container } = renderPage();
    fireEvent.click(await screen.findByTitle('Editar Perfil'));

    const select = screen.getByLabelText('Título') as HTMLSelectElement;
    expect(select.value).toBe('Dra.');

    fireEvent.change(select, { target: { value: 'Dr.' } });
    fireEvent.submit(container.ownerDocument.querySelector('form')!);

    await waitFor(() => expect(doctorRepository.updateDoctor).toHaveBeenCalled());
    expect(vi.mocked(doctorRepository.updateDoctor).mock.calls[0]).toEqual([
      'doc-lucia',
      expect.objectContaining({ professionalTitle: 'Dr.' }),
    ]);
  });
});

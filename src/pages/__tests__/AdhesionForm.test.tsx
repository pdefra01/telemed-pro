import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AdhesionForm } from '../AdhesionForm';
import { adhesionRepository } from '../../repositories/AdhesionRepository';
import { producerRepository } from '../../repositories/ProducerRepository';
import { planRepository } from '../../repositories/PlanRepository';

// Mock AdhesionRepository and PlanRepository
vi.mock('../../repositories/AdhesionRepository', () => ({
  adhesionRepository: {
    submitApplication: vi.fn()
  }
}));

// Mock ProducerRepository (Esc.9 — landing-time promoter code validation)
vi.mock('../../repositories/ProducerRepository', () => ({
  producerRepository: {
    getProducerByCode: vi.fn()
  }
}));

// Offered catalog (new-plans-pricing): every price the form shows comes from these rows.
const OFFERED_PLANS = [
  { id: 'p-ind', name: 'Individual', monthlyCost: 14999, isUnlimited: true, maxFamilyMembers: 0, paidMonths: 1, bonusMonths: 0, planKind: 'individual', paymentOption: 'standard', isOffered: true },
  { id: 'p-fam', name: 'Familiar', monthlyCost: 49999, isUnlimited: true, maxFamilyMembers: 4, paidMonths: 1, bonusMonths: 0, planKind: 'familiar', paymentOption: 'standard', isOffered: true },
  { id: 'p-card', name: 'Familiar Débito Tarjeta', monthlyCost: 39999, isUnlimited: true, maxFamilyMembers: 4, paidMonths: 1, bonusMonths: 0, planKind: 'familiar', paymentOption: 'card_debit', isOffered: true },
  { id: 'p-s6', name: 'Familiar Semestral', monthlyCost: 39999, isUnlimited: true, maxFamilyMembers: 4, paidMonths: 6, bonusMonths: 1, planKind: 'familiar', paymentOption: 'prepaid_6', isOffered: true },
  { id: 'p-s12', name: 'Familiar Anual', monthlyCost: 39999, isUnlimited: true, maxFamilyMembers: 4, paidMonths: 12, bonusMonths: 2, planKind: 'familiar', paymentOption: 'prepaid_12', isOffered: true },
];

vi.mock('../../repositories/PlanRepository', () => ({
  planRepository: {
    getOffered: vi.fn()
  }
}));

// Mock ToastContext
const mockToast = vi.fn();
vi.mock('../../context/ToastContext', () => ({
  useToast: () => ({ toast: mockToast })
}));

const renderForm = () => render(<AdhesionForm />, { wrapper: MemoryRouter });

const renderFormWithPromoter = (code: string) =>
  render(
    <MemoryRouter initialEntries={[`/adhesion?promoter=${code}`]}>
      <AdhesionForm />
    </MemoryRouter>
  );

const fillTitularStep1 = (options?: { skipCuil?: boolean; cuilValue?: string }) => {
  fireEvent.change(screen.getByPlaceholderText('Juan'), { target: { value: 'Juan' } });
  fireEvent.change(screen.getByPlaceholderText('Pérez'), { target: { value: 'Pérez' } });
  fireEvent.change(screen.getByPlaceholderText('Sin puntos ni espacios'), { target: { value: '30123456' } });
  if (!options?.skipCuil) {
    fireEvent.change(screen.getByPlaceholderText('Ej: 20-12345678-9'), {
      target: { value: options?.cuilValue ?? '20-30123456-7' }
    });
  }
  const birthDateInput = document.querySelector('input[type="date"]') as HTMLInputElement;
  fireEvent.change(birthDateInput, { target: { value: '1990-01-01' } });
  fireEvent.change(screen.getByPlaceholderText('Ej: Av. Belgrano 1234, Piso 2 A'), { target: { value: 'Calle Falsa 123' } });
  const selects = document.querySelectorAll('select');
  if (selects.length >= 3) {
    fireEvent.change(selects[1], { target: { value: 'Salta' } });
    fireEvent.change(selects[2], { target: { value: 'Salta' } });
  }
  fireEvent.change(screen.getByPlaceholderText('Centro'), { target: { value: 'Centro' } });
  fireEvent.change(screen.getByPlaceholderText('nombre@ejemplo.com'), { target: { value: 'juan@test.com' } });
  fireEvent.change(screen.getByPlaceholderText('3416123456'), { target: { value: '3416123456' } });
};

/**
 * Drives the wizard from Step 1 into Step 5, ready to submit. Email OTP
 * verification is currently suspended (EMAIL_VERIFICATION_REQUIRED = false
 * in AdhesionForm.tsx), so Step 1 advances without it. Step 2 picks the plan
 * (Familiar by default) and, for Familiar, a payment option; Individual skips
 * the family step.
 */
const next = () => fireEvent.click(screen.getByRole('button', { name: /Siguiente/i }));

const advanceToSignatureStep = async (opts?: { kind?: 'individual' | 'familiar'; option?: RegExp; standardMethod?: string }) => {
  fillTitularStep1();
  next(); // -> Step 2
  await screen.findByRole('button', { name: /Plan Individual/i });

  if (opts?.kind === 'individual') {
    fireEvent.click(screen.getByRole('button', { name: /Plan Individual/i }));
  } else {
    fireEvent.click(screen.getByRole('button', { name: /Plan Familiar/i }));
    if (opts?.option) fireEvent.click(screen.getByRole('button', { name: opts.option }));
    if (opts?.standardMethod) {
      fireEvent.change(screen.getByLabelText(/Medio de pago/i), { target: { value: opts.standardMethod } });
    }
  }
  next(); // -> Step 3 (Familiar) or Step 4 (Individual)
  if (opts?.kind !== 'individual') next(); // family step -> Step 4
  next(); // -> Step 5

  await waitFor(() => expect(screen.getByText(/Condiciones, Consentimiento y Firma/i)).toBeInTheDocument());
};

const signAndSubmit = (container: HTMLElement) => {
  fireEvent.click(screen.getByLabelText(/Autorizo el tratamiento de mis datos personales/i));
  const canvas = container.querySelector('canvas') as HTMLCanvasElement;
  fireEvent.mouseDown(canvas);
  fireEvent.mouseUp(canvas);
  fireEvent.click(screen.getByRole('button', { name: /Enviar Solicitud/i }));
};

describe('AdhesionForm - CUIL field and duplicate-rejection handling', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(planRepository.getOffered).mockResolvedValue(OFFERED_PLANS as any);

    // jsdom does not implement 2D canvas rendering; stub it so the signature step can be completed.
    HTMLCanvasElement.prototype.getContext = vi.fn().mockReturnValue({
      strokeStyle: '',
      lineWidth: 0,
      lineCap: '',
      lineJoin: '',
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      stroke: vi.fn(),
      clearRect: vi.fn()
    }) as any;
    HTMLCanvasElement.prototype.toDataURL = vi.fn().mockReturnValue('data:image/png;base64,xxx') as any;

    vi.spyOn(window, 'fetch').mockImplementation(() =>
      Promise.resolve({ ok: true, json: async () => ({}) } as Response)
    );
  });

  it('renders a CUIL input for the titular in Step 1', () => {
    renderForm();
    expect(screen.getByPlaceholderText('Ej: 20-12345678-9')).toBeInTheDocument();
  });

  it('blocks advancing to Step 2 when the titular CUIL is missing', () => {
    renderForm();
    fillTitularStep1({ skipCuil: true });

    fireEvent.click(screen.getByRole('button', { name: /Siguiente/i }));

    expect(mockToast).toHaveBeenCalledWith(
      'Por favor completá todos los campos obligatorios del titular',
      'warning'
    );
  });

  it('blocks advancing to Step 2 when the titular CUIL has an invalid format', () => {
    renderForm();
    fillTitularStep1({ cuilValue: '123' });

    fireEvent.click(screen.getByRole('button', { name: /Siguiente/i }));

    expect(mockToast).toHaveBeenCalledWith(
      'El CUIL debe tener 11 dígitos, con o sin guiones (formato NN-DDDDDDDD-C)',
      'warning'
    );
  });

  it('surfaces the duplicate-check conflict message via toast when submitApplication is rejected', async () => {
    vi.mocked(adhesionRepository.submitApplication).mockRejectedValueOnce(
      new Error('Este DNI ya se encuentra afiliado a Medinex.')
    );

    const { container } = renderForm();
    await advanceToSignatureStep();

    fireEvent.click(
      screen.getByLabelText(/Autorizo el tratamiento de mis datos personales/i)
    );

    const canvas = container.querySelector('canvas') as HTMLCanvasElement;
    fireEvent.mouseDown(canvas);
    fireEvent.mouseUp(canvas);

    fireEvent.click(screen.getByRole('button', { name: /Enviar Solicitud/i }));

    await waitFor(() => {
      expect(adhesionRepository.submitApplication).toHaveBeenCalled();
    });

    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith('Este DNI ya se encuentra afiliado a Medinex.', 'error');
    });
  });

  it('creates an MP preapproval for débito automático after a successful submission, then still shows the success screen', async () => {
    vi.mocked(adhesionRepository.submitApplication).mockResolvedValueOnce({ id: 'adhesion-99' });
    const fetchSpy = vi.spyOn(window, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, initPoint: 'https://mp.test/init' })
    } as Response);

    const { container } = renderForm();
    await advanceToSignatureStep(); // Familiar + credit-card auto debit by default

    fireEvent.click(screen.getByLabelText(/Autorizo el tratamiento de mis datos personales/i));
    const canvas = container.querySelector('canvas') as HTMLCanvasElement;
    fireEvent.mouseDown(canvas);
    fireEvent.mouseUp(canvas);

    fireEvent.click(screen.getByRole('button', { name: /Enviar Solicitud/i }));

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledWith('/api/adhesion/preapproval', expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ adhesionRequestId: 'adhesion-99' })
      }));
    });

    await waitFor(() => expect(screen.getByText(/¡Solicitud Enviada!/i)).toBeInTheDocument());
  });

  it('still shows the success screen when the MP preapproval creation fails (Resolved Decision #5)', async () => {
    vi.mocked(adhesionRepository.submitApplication).mockResolvedValueOnce({ id: 'adhesion-100' });
    vi.spyOn(window, 'fetch').mockResolvedValue({ ok: true, json: async () => ({ ok: false }) } as Response);

    const { container } = renderForm();
    await advanceToSignatureStep();

    fireEvent.click(screen.getByLabelText(/Autorizo el tratamiento de mis datos personales/i));
    const canvas = container.querySelector('canvas') as HTMLCanvasElement;
    fireEvent.mouseDown(canvas);
    fireEvent.mouseUp(canvas);

    fireEvent.click(screen.getByRole('button', { name: /Enviar Solicitud/i }));

    await waitFor(() => expect(screen.getByText(/¡Solicitud Enviada!/i)).toBeInTheDocument());
  });

  describe('new plan catalog', () => {
    const submitWith = async (opts?: Parameters<typeof advanceToSignatureStep>[0]) => {
      vi.mocked(adhesionRepository.submitApplication).mockResolvedValueOnce({ id: 'adhesion-7' });
      const fetchSpy = vi.spyOn(window, 'fetch').mockResolvedValue({ ok: true, json: async () => ({ ok: true }) } as Response);
      const { container } = renderForm();
      await advanceToSignatureStep(opts);
      signAndSubmit(container);
      await waitFor(() => expect(adhesionRepository.submitApplication).toHaveBeenCalled());
      await waitFor(() => expect(screen.getByText(/¡Solicitud Enviada!/i)).toBeInTheDocument());
      return { fetchSpy, payload: vi.mocked(adhesionRepository.submitApplication).mock.calls[0][0] as any };
    };
    const preapprovalCalls = (spy: any) => spy.mock.calls.filter((c: any[]) => c[0] === '/api/adhesion/preapproval');

    it('loads only the offered plans and shows every price from the plan rows, with no promo banner', async () => {
      renderForm();
      fillTitularStep1();
      next();

      await screen.findByRole('button', { name: /Plan Individual/i });
      expect(planRepository.getOffered).toHaveBeenCalled();
      expect(screen.getAllByText(/\$14\.999/).length).toBeGreaterThan(0);
      expect(screen.getAllByText(/\$39\.999/).length).toBeGreaterThan(0);
      expect(screen.getAllByText(/\$239\.994/).length).toBeGreaterThan(0);
      expect(screen.getAllByText(/\$479\.988/).length).toBeGreaterThan(0);
      expect(screen.getAllByText(/\$49\.999/).length).toBeGreaterThan(0);
      expect(screen.queryByText(/PROMOCION AGOSTO/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/25\.000|40\.000|50\.000/)).not.toBeInTheDocument();
      expect(screen.getAllByText(/consultas ilimitadas/i).length).toBeGreaterThan(0);
    });

    it('Individual: no payment question, no family step, submits individual/monthly and never calls MP', async () => {
      const { fetchSpy, payload } = await submitWith({ kind: 'individual' });

      expect(payload.plan_type).toBe('individual');
      expect(payload.payment_method).toBe('monthly');
      expect(payload.family_members).toEqual([]);
      expect(payload.titular_phone).toBe('3416123456');
      expect(preapprovalCalls(fetchSpy)).toHaveLength(0);
    });

    it('Individual hides the payment options and the prepaid choices', async () => {
      renderForm();
      fillTitularStep1();
      next();
      fireEvent.click(await screen.findByRole('button', { name: /Plan Individual/i }));

      expect(screen.queryByRole('button', { name: /Pago anticipado/i })).not.toBeInTheDocument();
      expect(screen.queryByLabelText(/Medio de pago/i)).not.toBeInTheDocument();
    });

    it('Familiar with credit-card auto debit submits card_debit and creates the MP preapproval', async () => {
      const { fetchSpy, payload } = await submitWith({ option: /Débito automático con tarjeta/i });

      expect(payload.plan_type).toBe('familiar');
      expect(payload.payment_method).toBe('card_debit');
      expect(preapprovalCalls(fetchSpy)).toHaveLength(1);
    });

    it('Familiar prepaid semester submits prepaid_6 and does not call MP', async () => {
      const { fetchSpy, payload } = await submitWith({ option: /Pago anticipado 6 meses/i });

      expect(payload.plan_type).toBe('familiar');
      expect(payload.payment_method).toBe('prepaid_6');
      expect(preapprovalCalls(fetchSpy)).toHaveLength(0);
    });

    it('Familiar prepaid annual submits prepaid_12', async () => {
      const { payload } = await submitWith({ option: /Pago anticipado 12 meses/i });
      expect(payload.payment_method).toBe('prepaid_12');
    });

    it('Familiar standard method (transfer) submits that method and does not call MP', async () => {
      const { fetchSpy, payload } = await submitWith({ option: /Pago mensual/i, standardMethod: 'transfer' });

      expect(payload.plan_type).toBe('familiar');
      expect(payload.payment_method).toBe('transfer');
      expect(preapprovalCalls(fetchSpy)).toHaveLength(0);
    });

    it('Familiar QR auto debit is an auto-debit method and creates the MP preapproval', async () => {
      const { fetchSpy, payload } = await submitWith({ option: /Pago mensual/i, standardMethod: 'qr_debit' });

      expect(payload.payment_method).toBe('qr_debit');
      expect(preapprovalCalls(fetchSpy)).toHaveLength(1);
    });

    it('caps the family section at the plan max (4) and clears members when switching to Individual', async () => {
      vi.mocked(adhesionRepository.submitApplication).mockResolvedValueOnce({ id: 'adhesion-8' });
      const { container } = renderForm();
      fillTitularStep1();
      next();
      await screen.findByRole('button', { name: /Plan Individual/i });
      next(); // Familiar default -> Step 3
      await screen.findByText(/Grupo Familiar Conviviente/i);

      for (let i = 0; i < 4; i++) {
        fireEvent.change(screen.getByPlaceholderText('Ej: María'), { target: { value: `Fam${i}` } });
        fireEvent.change(screen.getByPlaceholderText('Ej: Pérez'), { target: { value: 'Pérez' } });
        fireEvent.change(screen.getByPlaceholderText('Sin puntos'), { target: { value: `4000000${i}` } });
        fireEvent.change(screen.getByPlaceholderText('Ej: 27-31123456-4'), { target: { value: `20-4000000${i}-1` } });
        const dates = document.querySelectorAll('input[type="date"]');
        fireEvent.change(dates[dates.length - 1], { target: { value: '2000-01-01' } });
        fireEvent.click(screen.getByRole('button', { name: /Agregar Familiar al Grupo/i }));
      }
      expect(screen.getByText(/límite de 4 familiares adicionales/i)).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /Agregar Familiar al Grupo/i })).not.toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: /Atrás/i })); // -> Step 2
      fireEvent.click(await screen.findByRole('button', { name: /Plan Individual/i }));
      next(); // -> Step 4 (family step skipped)
      next(); // -> Step 5
      await screen.findByText(/Condiciones, Consentimiento y Firma/i);
      signAndSubmit(container);

      await waitFor(() => expect(adhesionRepository.submitApplication).toHaveBeenCalled());
      const payload = vi.mocked(adhesionRepository.submitApplication).mock.calls[0][0] as any;
      expect(payload.plan_type).toBe('individual');
      expect(payload.family_members).toEqual([]);
    });

    it('warns the user when the plan catalog could not be loaded', async () => {
      vi.mocked(planRepository.getOffered).mockRejectedValue(new Error('down'));
      renderForm();
      fillTitularStep1();
      next();
      await waitFor(() => expect(mockToast).toHaveBeenCalledWith(expect.stringMatching(/planes/i), 'error'));
    });
  });

  it('step 6 success screen never claims the DNI is the login password, and points to email-delivered credentials instead', async () => {
    vi.mocked(adhesionRepository.submitApplication).mockResolvedValueOnce({ id: 'adhesion-101' });
    vi.spyOn(window, 'fetch').mockResolvedValue({ ok: true, json: async () => ({ ok: false }) } as Response);

    const { container } = renderForm();
    await advanceToSignatureStep();

    fireEvent.click(screen.getByLabelText(/Autorizo el tratamiento de mis datos personales/i));
    const canvas = container.querySelector('canvas') as HTMLCanvasElement;
    fireEvent.mouseDown(canvas);
    fireEvent.mouseUp(canvas);

    fireEvent.click(screen.getByRole('button', { name: /Enviar Solicitud/i }));

    await waitFor(() => expect(screen.getByText(/¡Solicitud Enviada!/i)).toBeInTheDocument());

    expect(screen.queryByText(/contraseña temporal/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/DNI.*como usuario y contraseña/i)).not.toBeInTheDocument();
    expect(screen.getByText(/enlace para crear tu contraseña/i)).toBeInTheDocument();
  });
});

// sdd/advisor-auto-provisioning, design 3.6, Esc.9 — the referral link stops
// accepting new sign-ups for an advisor deactivated after the link was
// shared, instead of only failing at the final submit step (Step 4).
describe('AdhesionForm - promoter code validation on mount (Esc.9)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('clears and unlocks promoterCode, showing an inline notice, when the code is inactive', async () => {
    vi.mocked(producerRepository.getProducerByCode).mockResolvedValueOnce({
      id: 'adv-1',
      name: 'Pedro Gómez',
      producerCode: 'PROMO_INACTIVE',
      email: 'pedro@medinex.com',
      commissionRate: 10,
      status: 'inactive',
    } as any);

    renderFormWithPromoter('PROMO_INACTIVE');

    await waitFor(() => {
      expect(producerRepository.getProducerByCode).toHaveBeenCalledWith('PROMO_INACTIVE');
    });

    const promoterInput = await screen.findByPlaceholderText(/PROMO_JUAN_123/i);
    await waitFor(() => expect(promoterInput).not.toBeDisabled());
    expect(promoterInput).toHaveValue('');
    expect(screen.getByText(/El código de promotor no es válido o ya no está activo/i)).toBeInTheDocument();
  });

  it('clears and unlocks promoterCode when the code does not exist', async () => {
    vi.mocked(producerRepository.getProducerByCode).mockResolvedValueOnce(null);

    renderFormWithPromoter('DOES_NOT_EXIST');

    const promoterInput = await screen.findByPlaceholderText(/PROMO_JUAN_123/i);
    await waitFor(() => expect(promoterInput).not.toBeDisabled());
    expect(promoterInput).toHaveValue('');
  });

  it('keeps the promoter code locked and shows no warning when the code is active', async () => {
    vi.mocked(producerRepository.getProducerByCode).mockResolvedValueOnce({
      id: 'adv-1',
      name: 'Pedro Gómez',
      producerCode: 'PROMO_ACTIVE',
      email: 'pedro@medinex.com',
      commissionRate: 10,
      status: 'active',
    } as any);

    renderFormWithPromoter('PROMO_ACTIVE');

    await waitFor(() => {
      expect(producerRepository.getProducerByCode).toHaveBeenCalledWith('PROMO_ACTIVE');
    });

    const promoterInput = await screen.findByPlaceholderText(/PROMO_JUAN_123/i);
    expect(promoterInput).toBeDisabled();
    expect(promoterInput).toHaveValue('PROMO_ACTIVE');
    expect(screen.queryByText(/El código de promotor no es válido o ya no está activo/i)).not.toBeInTheDocument();
  });

  it('does not call getProducerByCode when there is no ?promoter= param', () => {
    renderForm();

    expect(producerRepository.getProducerByCode).not.toHaveBeenCalled();
  });
});

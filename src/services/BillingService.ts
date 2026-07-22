import { affiliateRepository } from '../repositories/AffiliateRepository';
import { agreementRepository } from '../repositories/AgreementRepository';
import { invoiceRepository } from '../repositories/InvoiceRepository';
import { taxRepository } from '../repositories/TaxRepository';
import { planRepository } from '../repositories/PlanRepository';
import { accountMovementRepository } from '../repositories/AccountMovementRepository';
import { billingEngine } from './BillingEngine';
import { calculateElapsedMonths, classifyBillingPeriod } from './CoverageWindowBilling';
import { Invoice } from '../types';

export class BillingService {
  /**
   * Ejecuta el ciclo de facturación mensual.
   *
   * Dos sub-lógicas coexisten en la misma corrida, sin mezclarse
   * (`sdd/cuenta-corriente-billing` — Scope Boundary):
   *  - CONVENIOS (B2B): ruta legacy, SIN MODIFICAR — `calculateAgreementTotal`
   *    + `createBulk`, con el pre-filtro `existingPeriodInvoices` de siempre.
   *  - AFILIADOS DIRECTOS (B2C): ruta NUEVA vía la ledger de cuenta corriente
   *    — cada cargo se posta atómicamente con `post_billing_charge` (upsert
   *    de factura + movimiento en una sola transacción), determinando
   *    cuota-pagada vs. cuota-bonificada contra el SNAPSHOT congelado de la
   *    ventana de cobertura (nunca el plan vivo). La idempotencia para
   *    afiliados ya no vive en `existingPeriodInvoices` — vive en la base
   *    (constraint UNIQUE + external_ref), así que una corrida parcial se
   *    autocorrige en el siguiente re-run en vez de quedar huérfana.
   *
   * @param period Formato 'YYYY-MM'
   */
  async runMonthlyBillingCycle(period: string): Promise<{
    processedAgreements: number;
    processedIndividuals: number;
    totalAmount: number;
    /** Afiliados con plan asignado pero sin ventana de cobertura abierta
     * (p.ej. alta vía `/approve-adhesion`, que nunca pasa por `assign_plan`)
     * — nunca se les fabrica un cargo; se reportan acá para que el admin que
     * corrió el ciclo los vea y decida cómo regularizarlos. */
    skippedNoWindow: { id: string; name: string }[];
  }> {
    console.log(`Iniciando ciclo de facturación para el periodo: ${period}`);

    // 1. Obtener configuración de impuestos y planes activa
    const [taxes, plans] = await Promise.all([
      taxRepository.getAll(),
      planRepository.getAll()
    ]);

    // 2. Facturas existentes del periodo — usado ÚNICAMENTE para el pre-filtro
    // de convenios (ruta legacy sin modificar). Para afiliados directos este
    // pre-filtro se DROPPEA (ver comentario arriba): la idempotencia ahora
    // vive en post_billing_charge (constraint UNIQUE(entity_type,entity_id,
    // period) + external_ref), nunca en un chequeo app-layer previo.
    const existingInvoices = await invoiceRepository.getAll();
    const existingPeriodInvoices = new Set(
      existingInvoices
        .filter(inv => inv.period === period)
        .map(inv => `${inv.entityType}-${inv.entityId}`)
    );

    // 3. Procesar Convenios (B2B) — LEGACY, SIN MODIFICAR
    const agreements = await agreementRepository.getAll();
    const activeAgreements = agreements.filter(a =>
      a.status === 'active' &&
      !existingPeriodInvoices.has(`agreement-${a.id}`)
    );

    // Traer todos los afiliados vinculados a convenios de una sola vez (Evita N+1)
    const allAgreementAffiliates = await affiliateRepository.getAllAffiliates();
    const affiliatesByAgreement = allAgreementAffiliates.reduce((acc, aff) => {
      const agreementId = aff.agreementId;
      if (agreementId) {
        if (!acc[agreementId]) acc[agreementId] = [];
        acc[agreementId].push(aff);
      }
      return acc;
    }, {} as Record<string, any[]>);

    const agreementInvoices: Partial<Invoice>[] = [];

    for (const agreement of activeAgreements) {
      const affiliates = affiliatesByAgreement[agreement.id] || [];
      if (affiliates.length === 0) continue;

      const netAmount = billingEngine.calculateAgreementTotal(
        affiliates.length,
        agreement.baseCostPerAffiliate
      );

      agreementInvoices.push(billingEngine.generateInvoiceData(
        agreement.id,
        'agreement',
        period,
        netAmount,
        taxes
      ));
    }

    if (agreementInvoices.length > 0) {
      await invoiceRepository.createBulk(agreementInvoices as Invoice[]);
    }

    // 4. Procesar Afiliados Directos (B2C) — NUEVO: vía ledger de cuenta
    // corriente. El costo NUNCA sale del plan vivo — sale del snapshot
    // congelado de la ventana de cobertura (D6), evitando que un cambio de
    // plan a mitad de ventana reclasifique retroactivamente meses ya
    // transcurridos.
    const directAffiliates = await affiliateRepository.getDirectAffiliates();
    const windowsByAffiliateId = await affiliateRepository.getCoverageWindowsForBilling(directAffiliates);

    const skippedNoWindow: { id: string; name: string }[] = [];
    let processedIndividuals = 0;
    let individualsAmount = 0;

    for (const affiliate of directAffiliates) {
      // Resolver el plan por id (nunca por nombre — el nombre es solo un cache
      // de display y puede quedar desactualizado si el admin renombra un plan).
      // Este chequeo sigue siendo una salvaguarda independiente del costo: un
      // afiliado sin un plan_id real resuelto nunca se factura, sea cual sea
      // el estado de su ventana.
      const plan = plans.find(p => p.id === affiliate.planId);

      if (!plan) {
        // Nunca fabricamos un costo por defecto: sin un plan_id real resuelto,
        // no sabemos cuánto cobrarle a este afiliado. Se omite su facturación
        // de este período (queda pendiente hasta que un admin le asigne un
        // plan) en vez de facturar un monto inventado.
        console.warn(`[BillingService] Afiliado ${affiliate.id} no tiene un plan válido asignado (planId: ${affiliate.planId ?? 'ninguno'}); se omite su facturación para el período ${period}.`);
        continue;
      }

      const window = windowsByAffiliateId.get(affiliate.id);
      if (!window) {
        // Plan asignado pero sin ventana de cobertura abierta (p.ej. alta vía
        // /approve-adhesion, que escribe plan_id/plan_status directo y nunca
        // pasa por assign_plan) — nunca se fabrica un cargo; se reporta al
        // admin en el resultado del ciclo en vez de solo loguearlo.
        skippedNoWindow.push({ id: affiliate.id, name: affiliate.name });
        continue;
      }

      const elapsedMonths = calculateElapsedMonths(window.periodStart, period);
      const classification = classifyBillingPeriod(elapsedMonths, window.paidMonthsSnapshot, window.bonusMonthsSnapshot);

      if (classification === 'expired') {
        // Ventana vencida (o el período es anterior a su apertura) — requiere
        // renovación explícita del admin; el ciclo mensual nunca renueva ni
        // factura automáticamente una ventana vencida.
        continue;
      }

      const amount = classification === 'paid' ? window.monthlyCostSnapshot : 0;

      // Atómico: upsert de factura + movimiento de cargo en una sola
      // transacción (D5b). Idempotente por external_ref — un re-run para el
      // mismo período nunca duplica, se autocorrige si el ciclo anterior
      // falló a mitad de camino.
      await accountMovementRepository.postBillingCharge({
        entityId: affiliate.id,
        period,
        amount,
        externalRef: `charge:affiliate:${affiliate.id}:${period}`,
      });

      processedIndividuals++;
      individualsAmount += amount;
    }

    const agreementsAmount = agreementInvoices.reduce((acc, curr) => acc + (curr.totalAmount || 0), 0);
    const totalAmount = agreementsAmount + individualsAmount;

    return {
      processedAgreements: agreementInvoices.length,
      processedIndividuals,
      totalAmount,
      skippedNoWindow,
    };
  }

  /**
   * Concilia una factura (marcar como pagada y actualizar estados).
   *
   * Branchea por tipo de entidad (D5c):
   *  - `affiliate`: ruta NUEVA — un único RPC atómico (`post_payment_movement`)
   *    posta el movimiento de pago Y marca la factura `paid` Y reactiva el
   *    plan del afiliado, en una sola transacción.
   *  - `agreement`: ruta LEGACY, SIN MODIFICAR — status flip +
   *    `updateStatusByAgreement` (reactivación masiva de todos sus afiliados).
   */
  async reconcileInvoice(invoiceId: string): Promise<void> {
    const invoice = await invoiceRepository.getById(invoiceId);
    if (!invoice) throw new Error('Factura no encontrada');

    if (invoice.entityType === 'affiliate') {
      // external_ref determinístico (payment:manual:{invoice_id}) para que un
      // doble-click/retry de este mismo botón colapse sobre el mismo
      // movimiento en vez de crear uno nuevo (D4).
      await accountMovementRepository.postPaymentMovement({
        invoiceId,
        entityId: invoice.entityId,
        amount: invoice.totalAmount,
        externalRef: `payment:manual:${invoiceId}`,
      });
    } else if (invoice.entityType === 'agreement') {
      // Convenios: ruta legacy SIN MODIFICAR (fuera de alcance de este cambio).
      await invoiceRepository.updateStatus(invoiceId, 'paid');
      await affiliateRepository.updateStatusByAgreement(invoice.entityId, 'active');
    }
  }
}

export const billingService = new BillingService();

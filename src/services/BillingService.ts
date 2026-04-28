import { affiliateRepository } from '../repositories/AffiliateRepository';
import { agreementRepository } from '../repositories/AgreementRepository';
import { invoiceRepository } from '../repositories/InvoiceRepository';
import { taxRepository } from '../repositories/TaxRepository';
import { planRepository } from '../repositories/PlanRepository';
import { billingEngine } from './BillingEngine';
import { Invoice } from '../types';

export class BillingService {
  /**
   * Ejecuta el ciclo de facturación mensual
   * @param period Formato 'YYYY-MM'
   */
  /**
   * Ejecuta el ciclo de facturación mensual
   * @param period Formato 'YYYY-MM'
   */
  async runMonthlyBillingCycle(period: string): Promise<{
    processedAgreements: number;
    processedIndividuals: number;
    totalAmount: number;
  }> {
    console.log(`Iniciando ciclo de facturación para el periodo: ${period}`);
    
    // 1. Obtener configuración de impuestos y planes activa
    const [taxes, plans] = await Promise.all([
      taxRepository.getAll(),
      planRepository.getAll()
    ]);
    
    // 2. Obtener facturas existentes para evitar duplicados
    const existingInvoices = await invoiceRepository.getAll();
    const existingPeriodInvoices = new Set(
      existingInvoices
        .filter(inv => inv.period === period)
        .map(inv => `${inv.entityType}-${inv.entityId}`)
    );

    // 3. Procesar Convenios (B2B)
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

    // 4. Procesar Afiliados Directos (B2C)
    const directAffiliates = await affiliateRepository.getDirectAffiliates();
    const activeDirects = directAffiliates.filter(a => 
      !existingPeriodInvoices.has(`affiliate-${a.id}`)
    );
    
    const individualInvoices: Partial<Invoice>[] = [];

    for (const affiliate of activeDirects) {
      // Buscar costo en la tabla de planes según el nombre del plan
      const plan = plans.find(p => p.name === affiliate.planName);
      const baseCost = plan?.price || 5000;

      individualInvoices.push(billingEngine.generateInvoiceData(
        affiliate.id,
        'affiliate',
        period,
        baseCost,
        taxes
      ));
    }

    // 5. Guardar todas las facturas
    const allInvoices = [...agreementInvoices, ...individualInvoices];
    if (allInvoices.length > 0) {
      await invoiceRepository.createBulk(allInvoices as Invoice[]);
    }

    const totalAmount = allInvoices.reduce((acc, curr) => acc + (curr.totalAmount || 0), 0);

    return {
      processedAgreements: agreementInvoices.length,
      processedIndividuals: individualInvoices.length,
      totalAmount
    };
  }

  /**
   * Concilia una factura (marcar como pagada y actualizar estados)
   */
  async reconcileInvoice(invoiceId: string): Promise<void> {
    const invoice = await invoiceRepository.getById(invoiceId);
    if (!invoice) throw new Error('Factura no encontrada');

    // 1. Actualizar estado de la factura
    await invoiceRepository.updateStatus(invoiceId, 'paid');

    // 2. Si es afiliado directo, poner su plan en activo
    if (invoice.entityType === 'affiliate') {
      await affiliateRepository.updateAffiliate(invoice.entityId, {
        planStatus: 'active'
      });
    } 
    // 3. Si es convenio, actualización MASIVA de todos sus afiliados (Sin N+1)
    else if (invoice.entityType === 'agreement') {
      await affiliateRepository.updateStatusByAgreement(invoice.entityId, 'active');
    }
  }
}

export const billingService = new BillingService();

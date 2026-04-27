import { TaxConfiguration, Invoice } from '../types';

export interface TaxResult {
  totalTax: number;
  details: { name: string; rate: number; amount: number }[];
}

export class BillingEngine {
  /**
   * Calcula el desglose de impuestos para un monto neto
   */
  calculateTaxes(netAmount: number, taxes: TaxConfiguration[]): TaxResult {
    const activeTaxes = taxes.filter(t => t.isActive);
    
    const details = activeTaxes.map(tax => {
      const amount = Number((netAmount * (tax.rate / 100)).toFixed(2));
      return {
        name: tax.name,
        rate: tax.rate,
        amount
      };
    });

    const totalTax = Number(details.reduce((acc, curr) => acc + curr.amount, 0).toFixed(2));

    return {
      totalTax,
      details
    };
  }

  /**
   * Genera la data para una nueva factura
   */
  generateInvoiceData(
    entityId: string,
    entityType: 'affiliate' | 'agreement',
    period: string,
    netAmount: number,
    taxes: TaxConfiguration[]
  ): Partial<Invoice> {
    const taxResult = this.calculateTaxes(netAmount, taxes);
    const totalAmount = Number((netAmount + taxResult.totalTax).toFixed(2));

    return {
      entityId,
      entityType,
      period,
      netAmount,
      taxAmount: taxResult.totalTax,
      totalAmount,
      taxDetails: taxResult.details,
      status: 'issued',
      createdAt: new Date().toISOString()
    };
  }
}

export const billingEngine = new BillingEngine();

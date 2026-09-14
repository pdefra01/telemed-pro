import { invoiceRepository } from '../repositories/InvoiceRepository';
import { appointmentRepository } from '../repositories/AppointmentRepository';
import { operatingExpenseRepository } from '../repositories/OperatingExpenseRepository';
import { PLSummary, OperatingExpense } from '../types';

/** Honorario de respaldo cuando el médico no tiene `consultation_fee` configurado. */
const FALLBACK_CONSULTATION_FEE = 1500;

export class FinancialService {
  /**
   * Obtiene la consolidación de ingresos y egresos (P&L) para un periodo específico
   * @param period Formato 'YYYY-MM'
   */
  async getPLSummary(period: string): Promise<PLSummary> {
    const [invoices, manualExpenses, medicalFees] = await Promise.all([
      invoiceRepository.getPaidByPeriod(period),
      operatingExpenseRepository.getByPeriod(period),
      appointmentRepository.getCompletedConsultationFeesByPeriod(period),
    ]);

    // Desglose de ingresos (B2B = convenios, B2C = afiliados directos)
    let b2bRevenue = 0;
    let b2cRevenue = 0;
    const pharmacyRevenue = 0; // Sin fuente de datos dedicada aún; reservado para farmacia.

    invoices.forEach(inv => {
      if (inv.entityType === 'agreement') {
        b2bRevenue += inv.totalAmount;
      } else {
        b2cRevenue += inv.totalAmount;
      }
    });

    // Desglose de egresos manuales por categoría
    let infrastructureExpenses = 0;
    let marketingExpenses = 0;
    let administrativeExpenses = 0;
    let otherExpenses = 0;

    manualExpenses.forEach(exp => {
      switch (exp.category) {
        case 'infrastructure':
          infrastructureExpenses += exp.amount;
          break;
        case 'marketing':
          marketingExpenses += exp.amount;
          break;
        case 'administrative':
          administrativeExpenses += exp.amount;
          break;
        default:
          otherExpenses += exp.amount;
          break;
      }
    });

    // Egresos variables por honorarios médicos (consultas completadas del periodo)
    const totalMedicalFees = medicalFees.reduce(
      (acc, fee) => acc + (fee !== null && fee !== undefined ? fee : FALLBACK_CONSULTATION_FEE),
      0
    );

    const totalRevenue = b2bRevenue + b2cRevenue + pharmacyRevenue;
    const totalExpenses =
      totalMedicalFees + infrastructureExpenses + marketingExpenses + administrativeExpenses + otherExpenses;
    const netProfit = totalRevenue - totalExpenses;
    const netMargin = totalRevenue > 0 ? (netProfit / totalRevenue) * 100 : 0;

    return {
      period,
      totalRevenue,
      totalExpenses,
      netProfit,
      netMargin,
      breakdown: {
        revenue: {
          b2c: b2cRevenue,
          b2b: b2bRevenue,
          pharmacy: pharmacyRevenue,
        },
        expenses: {
          medicalFees: totalMedicalFees,
          infrastructure: infrastructureExpenses,
          marketing: marketingExpenses,
          administrative: administrativeExpenses,
          other: otherExpenses,
        },
      },
    };
  }

  /**
   * Registra un egreso operativo
   */
  async saveExpense(expense: Omit<OperatingExpense, 'id' | 'createdAt'>): Promise<OperatingExpense> {
    return operatingExpenseRepository.create(expense);
  }

  /**
   * Obtiene la lista de todos los egresos del periodo
   */
  async getExpensesByPeriod(period: string): Promise<OperatingExpense[]> {
    return operatingExpenseRepository.getByPeriod(period);
  }

  /**
   * Elimina un egreso operativo
   */
  async deleteExpense(id: string): Promise<void> {
    return operatingExpenseRepository.delete(id);
  }
}

export const financialService = new FinancialService();

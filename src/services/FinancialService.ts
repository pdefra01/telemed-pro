import { supabase } from './supabase';
import { PLSummary, OperatingExpense } from '../types';

export class FinancialService {
  /**
   * Obtiene la consolidación de ingresos y egresos (P&L) para un periodo específico
   * @param period Formato 'YYYY-MM'
   */
  async getPLSummary(period: string): Promise<PLSummary> {
    // 1. Obtener ingresos pagados (Invoices con status = 'paid' del periodo)
    const { data: invoices, error: invError } = await supabase
      .from('invoices')
      .select('*')
      .eq('period', period)
      .eq('status', 'paid');

    if (invError) throw invError;

    // Calcular desglose de ingresos (B2B, B2C, Farmacia)
    let b2bRevenue = 0;
    let b2cRevenue = 0;
    let pharmacyRevenue = 0; // Si hay una categoría o campo, o la sumamos como b2c por defecto

    (invoices || []).forEach(inv => {
      const amount = Number(inv.total_amount || inv.totalAmount || 0);
      if (inv.entity_type === 'agreement') {
        b2bRevenue += amount;
      } else {
        // En nuestro esquema simplificado, los afiliados directos entran como B2C
        b2cRevenue += amount;
      }
    });

    // 2. Obtener egresos registrados manualmente desde la base de datos
    const { data: manualExpenses, error: expError } = await supabase
      .from('operating_expenses')
      .select('*')
      .eq('period', period);

    if (expError) throw expError;

    let infrastructureExpenses = 0;
    let marketingExpenses = 0;
    let administrativeExpenses = 0;
    let otherExpenses = 0;

    (manualExpenses || []).forEach(exp => {
      const amount = Number(exp.amount || 0);
      switch (exp.category) {
        case 'infrastructure':
          infrastructureExpenses += amount;
          break;
        case 'marketing':
          marketingExpenses += amount;
          break;
        case 'administrative':
          administrativeExpenses += amount;
          break;
        default:
          otherExpenses += amount;
          break;
      }
    });

    // 3. Obtener honorarios médicos (Egresos Variables)
    // Calculamos las consultas completadas (status = 'completed') que fueron agendadas en ese mes
    const startDate = `${period}-01T00:00:00.000Z`;
    // Obtener último día del mes
    const year = parseInt(period.split('-')[0]);
    const month = parseInt(period.split('-')[1]);
    const lastDay = new Date(year, month, 0).getDate();
    const endDate = `${period}-${String(lastDay).padStart(2, '0')}T23:59:59.999Z`;

    const { data: appointments, error: apptError } = await supabase
      .from('appointments')
      .select('*, doctor:profiles!doctor_id(consultation_fee)')
      .eq('status', 'completed')
      .gte('scheduled_at', startDate)
      .lte('scheduled_at', endDate);

    if (apptError) throw apptError;

    let medicalFees = 0;
    (appointments || []).forEach(appt => {
      const fee = Number(appt.doctor?.consultation_fee || 0);
      medicalFees += fee > 0 ? fee : 1500; // Fallback fee de $1500 por consulta si no está configurado
    });

    // Consolidar totales
    const totalRevenue = b2bRevenue + b2cRevenue + pharmacyRevenue;
    const totalExpenses = medicalFees + infrastructureExpenses + marketingExpenses + administrativeExpenses + otherExpenses;
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
          pharmacy: pharmacyRevenue
        },
        expenses: {
          medicalFees,
          infrastructure: infrastructureExpenses,
          marketing: marketingExpenses,
          administrative: administrativeExpenses,
          other: otherExpenses
        }
      }
    };
  }

  /**
   * Registra un egreso operativo
   */
  async saveExpense(expense: Omit<OperatingExpense, 'id' | 'createdAt'>): Promise<OperatingExpense> {
    const { data, error } = await supabase
      .from('operating_expenses')
      .insert([expense])
      .select()
      .single();

    if (error) throw error;
    return {
      id: data.id,
      period: data.period,
      category: data.category,
      amount: Number(data.amount),
      description: data.description,
      createdAt: data.created_at
    };
  }

  /**
   * Obtiene la lista de todos los egresos del periodo
   */
  async getExpensesByPeriod(period: string): Promise<OperatingExpense[]> {
    const { data, error } = await supabase
      .from('operating_expenses')
      .select('*')
      .eq('period', period)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return (data || []).map(d => ({
      id: d.id,
      period: d.period,
      category: d.category,
      amount: Number(d.amount),
      description: d.description,
      createdAt: d.created_at
    }));
  }

  /**
   * Elimina un egreso operativo
   */
  async deleteExpense(id: string): Promise<void> {
    const { error } = await supabase
      .from('operating_expenses')
      .delete()
      .eq('id', id);

    if (error) throw error;
  }
}

export const financialService = new FinancialService();

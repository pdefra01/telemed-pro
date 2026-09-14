import { supabase } from '../services/supabase';
import { OperatingExpense } from '../types';

function mapRowToOperatingExpense(row: any): OperatingExpense {
  return {
    id: row.id,
    period: row.period,
    category: row.category,
    amount: Number(row.amount),
    description: row.description,
    createdAt: row.created_at,
  };
}

export class OperatingExpenseRepository {
  /**
   * Obtiene los egresos operativos registrados para un periodo ('YYYY-MM'), del más al menos reciente.
   */
  async getByPeriod(period: string): Promise<OperatingExpense[]> {
    const { data, error } = await supabase
      .from('operating_expenses')
      .select('*')
      .eq('period', period)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return (data || []).map(mapRowToOperatingExpense);
  }

  /**
   * Registra un nuevo egreso operativo.
   */
  async create(expense: Omit<OperatingExpense, 'id' | 'createdAt'>): Promise<OperatingExpense> {
    const { data, error } = await supabase
      .from('operating_expenses')
      .insert([expense])
      .select()
      .single();

    if (error) throw error;
    return mapRowToOperatingExpense(data);
  }

  /**
   * Elimina un egreso operativo por id.
   */
  async delete(id: string): Promise<void> {
    const { error } = await supabase
      .from('operating_expenses')
      .delete()
      .eq('id', id);

    if (error) throw error;
  }
}

export const operatingExpenseRepository = new OperatingExpenseRepository();

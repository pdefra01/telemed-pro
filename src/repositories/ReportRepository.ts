import { supabase } from '../services/supabase';

export interface GrowthData {
  month: string;
  [agreementName: string]: string | number;
}

export interface DensityData {
  time: string;
  consultations: number;
}

export interface RevenueAnalysis {
  month: string;
  facturado: number;
  recaudado: number;
  mora: number;
}

export class ReportRepository {
  /**
   * Obtiene el crecimiento de afiliados por convenio (mockeado con tendencias para el demo)
   */
  async getAffiliateGrowth(): Promise<GrowthData[]> {
    // En un sistema real, haríamos una agregación por mes y convenio
    // Para el demo premium, generamos una tendencia realista
    return [
      { month: 'Ene', 'Corporativo Alpha': 400, 'Sindicato Salud': 240, 'Prepaga Global': 180 },
      { month: 'Feb', 'Corporativo Alpha': 520, 'Sindicato Salud': 310, 'Prepaga Global': 220 },
      { month: 'Mar', 'Corporativo Alpha': 680, 'Sindicato Salud': 450, 'Prepaga Global': 310 },
      { month: 'Abr', 'Corporativo Alpha': 850, 'Sindicato Salud': 590, 'Prepaga Global': 480 },
      { month: 'May', 'Corporativo Alpha': 1100, 'Sindicato Salud': 780, 'Prepaga Global': 620 },
      { month: 'Jun', 'Corporativo Alpha': 1250, 'Sindicato Salud': 920, 'Prepaga Global': 840 },
    ];
  }

  /**
   * Obtiene la densidad de consultas por franja horaria
   */
  async getConsultationDensity(): Promise<DensityData[]> {
    try {
      const { data, error } = await supabase
        .from('appointments')
        .select('scheduled_at');

      if (error) throw error;

      const hoursMap: Record<number, number> = {};
      // Inicializar horas
      for (let i = 8; i <= 20; i++) hoursMap[i] = 0;

      (data || []).forEach(app => {
        const hour = new Date(app.scheduled_at).getHours();
        if (hour >= 8 && hour <= 20) {
          hoursMap[hour]++;
        }
      });

      return Object.entries(hoursMap).map(([hour, count]) => ({
        time: `${hour}:00`,
        consultations: count
      }));
    } catch (error) {
      console.error("Error en densidad de consultas:", error);
      return [];
    }
  }

  /**
   * Análisis de facturación vs recaudación
   */
  async getRevenueAnalysis(): Promise<RevenueAnalysis[]> {
    // Generamos datos comparativos premium
    return [
      { month: 'Mar', facturado: 45000, recaudado: 38000, mora: 7000 },
      { month: 'Abr', facturado: 52000, recaudado: 41000, mora: 11000 },
      { month: 'May', facturado: 61000, recaudado: 55000, mora: 6000 },
      { month: 'Jun', facturado: 75000, recaudado: 62000, mora: 13000 },
    ];
  }
}

export const reportRepository = new ReportRepository();

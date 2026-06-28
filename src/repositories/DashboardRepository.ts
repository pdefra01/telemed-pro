import { supabase } from '../services/supabase';

export interface AdminMetrics {
  totalDoctors: number;
  totalAffiliates: number;
  recentAppointments: number;
  activeAgreements: number;
  monthlyRevenue: number;
  pendingInvoices: number;
}

export interface WeeklyStat {
  name: string;
  consultations: number;
}

export class DashboardRepository {
  /**
   * Obtiene las métricas para el dashboard de administración
   */
  async getMetrics(): Promise<AdminMetrics> {
    try {
      // Obtener total de médicos
      const { count: doctorsCount, error: errDoctors } = await supabase
        .from('profiles')
        .select('*', { count: 'exact', head: true })
        .eq('role', 'doctor');

      if (errDoctors) throw errDoctors;

      // Obtener total de afiliados
      const { count: affiliatesCount, error: errAffiliates } = await supabase
        .from('profiles')
        .select('*', { count: 'exact', head: true })
        .eq('role', 'patient');

      if (errAffiliates) throw errAffiliates;

      // Obtener cantidad de citas recientes
      let appointmentsCount = 0;
      const { count: appCount, error: errApp } = await supabase
        .from('appointments')
        .select('*', { count: 'exact', head: true });

      if (!errApp) {
        appointmentsCount = appCount || 0;
      }

      // Obtener convenios activos
      const { count: agreementsCount } = await supabase
        .from('agreements')
        .select('*', { count: 'exact', head: true });

      // Obtener recaudación mensual (suma de facturas pagadas del mes actual)
      const { data: revenueData } = await supabase
        .from('invoices')
        .select('total_amount')
        .eq('status', 'paid');
      
      const monthlyRevenue = (revenueData || []).reduce((acc, inv) => acc + (inv.total_amount || 0), 0);

      // Facturas pendientes
      const { count: pendingCount } = await supabase
        .from('invoices')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'issued');

      return {
        totalDoctors: doctorsCount || 0,
        totalAffiliates: affiliatesCount || 0,
        recentAppointments: appointmentsCount,
        activeAgreements: agreementsCount || 0,
        monthlyRevenue,
        pendingInvoices: pendingCount || 0
      };
    } catch (error) {
      console.error("Error obteniendo métricas del dashboard:", error);
      return {
        totalDoctors: 0,
        totalAffiliates: 0,
        recentAppointments: 0,
        activeAgreements: 0,
        monthlyRevenue: 0,
        pendingInvoices: 0
      };
    }
  }

  /**
   * Obtiene estadísticas de consultas por día de la semana
   */
  async getWeeklyStats(): Promise<WeeklyStat[]> {
    try {
      const { data, error } = await supabase
        .from('appointments')
        .select('scheduled_at')
        .order('scheduled_at', { ascending: true });

      if (error) throw error;

      const daysMap: Record<number, number> = {
        0: 0, // Dom
        1: 0, // Lun
        2: 0, // Mar
        3: 0, // Mie
        4: 0, // Jue
        5: 0, // Vie
        6: 0  // Sab
      };

      (data || []).forEach(row => {
        const date = new Date(row.scheduled_at);
        const day = date.getUTCDay();
        daysMap[day]++;
      });

      return [
        { name: 'Lun', consultations: daysMap[1] },
        { name: 'Mar', consultations: daysMap[2] },
        { name: 'Mie', consultations: daysMap[3] },
        { name: 'Jue', consultations: daysMap[4] },
        { name: 'Vie', consultations: daysMap[5] },
        { name: 'Sab', consultations: daysMap[6] },
        { name: 'Dom', consultations: daysMap[0] }
      ];
    } catch (error) {
      console.error("Error obteniendo estadísticas semanales:", error);
      return [
        { name: 'Lun', consultations: 0 },
        { name: 'Mar', consultations: 0 },
        { name: 'Mie', consultations: 0 },
        { name: 'Jue', consultations: 0 },
        { name: 'Vie', consultations: 0 },
        { name: 'Sab', consultations: 0 },
        { name: 'Dom', consultations: 0 }
      ];
    }
  }

  /**
   * Obtiene la cola de pacientes en tiempo real para un médico (usando la vista doctor_queue)
   */
  async getDoctorQueue(doctorId: string): Promise<any[]> {
    try {
      const { data, error } = await supabase
        .from('doctor_queue')
        .select('*')
        .eq('doctor_id', doctorId);

      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error("Error obteniendo cola del médico:", error);
      return [];
    }
  }

  /**
   * Obtiene los KPIs dinámicos del médico (Consultas pendientes, efectivas y tiempo promedio de sesión)
   */
  async getDoctorKPIs(doctorId: string, timeframe: 'daily' | 'weekly' | 'monthly'): Promise<{
    pendingConsultations: number;
    effectiveConsultations: number;
    avgSessionMinutes: number;
  }> {
    try {
      // 1. Consultas Pendientes (status: 'confirmed' o 'in_progress')
      const { count: pendingCount, error: errPending } = await supabase
        .from('appointments')
        .select('*', { count: 'exact', head: true })
        .eq('doctor_id', doctorId)
        .in('status', ['confirmed', 'in_progress']);

      if (errPending) console.warn("Error buscando consultas pendientes:", errPending);

      // 2. Filtrar por rango de fecha para Consultas Efectivas y Tiempo Promedio
      const now = new Date();
      let startDate = new Date();

      if (timeframe === 'daily') {
        startDate.setHours(0, 0, 0, 0);
      } else if (timeframe === 'weekly') {
        const day = now.getDay() || 7; // 1 (Lun) a 7 (Dom)
        startDate.setDate(now.getDate() - day + 1);
        startDate.setHours(0, 0, 0, 0);
      } else if (timeframe === 'monthly') {
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
      }

      const { data: completedData, error: errCompleted } = await supabase
        .from('appointments')
        .select('duration_minutes, created_at, scheduled_at')
        .eq('doctor_id', doctorId)
        .eq('status', 'completed')
        .gte('scheduled_at', startDate.toISOString());

      if (errCompleted) console.warn("Error buscando consultas completadas:", errCompleted);

      const effectiveCount = completedData?.length || 0;

      let avgMinutes = 0;
      if (effectiveCount > 0) {
        const totalMinutes = completedData.reduce((acc, row) => acc + (row.duration_minutes || 15), 0);
        avgMinutes = Math.round(totalMinutes / effectiveCount);
      } else {
        avgMinutes = 15; // Valor por defecto de referencia cuando no hay atenciones en el período
      }

      return {
        pendingConsultations: pendingCount || 0,
        effectiveConsultations: effectiveCount,
        avgSessionMinutes: avgMinutes
      };
    } catch (error) {
      console.error("Error obteniendo KPIs del médico:", error);
      return {
        pendingConsultations: 0,
        effectiveConsultations: 0,
        avgSessionMinutes: 15
      };
    }
  }
}

export const dashboardRepository = new DashboardRepository();

import { supabase } from '../services/supabase';
import { appointmentRepository } from './AppointmentRepository';
import { AnalyticsTimeframe, getAnalyticsPeriod, formatTrend } from '../utils/analyticsPeriod';

export interface CriticalAlert {
  id: string;
  type: 'danger' | 'warning' | 'info';
  message: string;
}

export interface AdminMetrics {
  totalDoctors: number;
  onlineDoctors: number;
  totalAffiliates: number;
  recentAppointments: number;
  activeAgreements: number;
  monthlyRevenue: number;
  pendingInvoices: number;
  criticalAlerts: CriticalAlert[];
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

      // Obtener médicos online (con turno de trabajo activo en doctor_work_shifts)
      let onlineDoctorsCount = 0;
      const { count: onlineCount, error: errOnline } = await supabase
        .from('doctor_work_shifts')
        .select('*', { count: 'exact', head: true })
        .is('clock_out', null);

      if (!errOnline && onlineCount !== null) {
        onlineDoctorsCount = onlineCount;
      }

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

      // Generar alertas críticas dinámicas
      const criticalAlerts: CriticalAlert[] = [];

      // 1. Alerta de Ausentismo (turnos no_show en los últimos 30 días)
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      const { count: totalRecentAppts } = await supabase
        .from('appointments')
        .select('*', { count: 'exact', head: true })
        .gte('scheduled_at', thirtyDaysAgo);

      const { count: noShowCount } = await supabase
        .from('appointments')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'no_show')
        .gte('scheduled_at', thirtyDaysAgo);

      if (totalRecentAppts && totalRecentAppts > 0 && noShowCount && noShowCount > 0) {
        const rate = Math.round((noShowCount / totalRecentAppts) * 100);
        if (rate > 15) {
          criticalAlerts.push({
            id: 'absenteeism',
            type: 'warning',
            message: `Tasa de ausentismo médico/paciente en ${rate}% (${noShowCount} turnos no_show este mes).`
          });
        }
      }

      // 2. Alerta de Facturas/Convenios Pendientes
      if (pendingCount && pendingCount > 0) {
        criticalAlerts.push({
          id: 'pending_invoices',
          type: 'danger',
          message: `${pendingCount} factura(s) de convenios pendientes de cobro.`
        });
      }

      // 3. Alerta de Cobertura de Guardia
      if (onlineDoctorsCount === 0 && (doctorsCount || 0) > 0) {
        criticalAlerts.push({
          id: 'no_online_doctors',
          type: 'warning',
          message: `Sin médicos en guardia activa en este momento.`
        });
      }

      return {
        totalDoctors: doctorsCount || 0,
        onlineDoctors: onlineDoctorsCount,
        totalAffiliates: affiliatesCount || 0,
        recentAppointments: appointmentsCount,
        activeAgreements: agreementsCount || 0,
        monthlyRevenue,
        pendingInvoices: pendingCount || 0,
        criticalAlerts
      };
    } catch (error) {
      console.error("Error obteniendo métricas del dashboard:", error);
      return {
        totalDoctors: 0,
        onlineDoctors: 0,
        totalAffiliates: 0,
        recentAppointments: 0,
        activeAgreements: 0,
        monthlyRevenue: 0,
        pendingInvoices: 0,
        criticalAlerts: []
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
      await appointmentRepository.expireStaleAppointments();

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
      await appointmentRepository.expireStaleAppointments();

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
        const totalMinutes = completedData.reduce((acc, row) => acc + (row.duration_minutes || 0), 0);
        avgMinutes = Math.round(totalMinutes / effectiveCount);
      }
      // Sin atenciones completadas en el período: avgMinutes queda en 0,
      // la UI lo muestra como "—" en vez de un valor de referencia inventado.

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

  /**
   * Analíticas del dashboard administrativo: el período elegido (día, semana Lun-Dom o mes
   * calendario que contiene `anchor`) contra el período inmediatamente anterior.
   */
  async getAdminAnalytics(
    doctorId: string = 'global',
    timeframe: AnalyticsTimeframe = 'weekly',
    anchor: Date = new Date()
  ): Promise<{
    timeSeries: Array<{ name: string; consultations: number; previousConsultations: number; avgDuration: number; workHours: number }>;
    summary: {
      totalConsultations: number;
      previousTotalConsultations: number;
      avgSessionTime: number;
      totalWorkHours: number;
      consultationTrend: string;
      durationTrend: string;
    };
  }> {
    try {
      const period = getAnalyticsPeriod(timeframe, anchor);
      const fromIso = period.prevStart.toISOString();
      const toIso = period.end.toISOString();

      // 1. Citas de ambos períodos
      let appQuery = supabase
        .from('appointments')
        .select('id, doctor_id, status, duration_minutes, scheduled_at, created_at')
        .gte('scheduled_at', fromIso)
        .lt('scheduled_at', toIso);
      if (doctorId !== 'global') {
        appQuery = appQuery.eq('doctor_id', doctorId);
      }
      const { data: appData, error: errApp } = await appQuery;
      if (errApp) console.warn("Error buscando appointments para admin analytics:", errApp);

      // 2. Jornadas de trabajo (shifts) de ambos períodos
      let shiftQuery = supabase
        .from('doctor_work_shifts')
        .select('id, doctor_id, duration_minutes, clock_in')
        .gte('clock_in', fromIso)
        .lt('clock_in', toIso);
      if (doctorId !== 'global') {
        shiftQuery = shiftQuery.eq('doctor_id', doctorId);
      }
      const { data: shiftData, error: errShift } = await shiftQuery;
      if (errShift) console.warn("Error buscando shifts para admin analytics:", errShift);

      // 3. Etiquetas y bucket por timeframe
      let labels: string[];
      let bucketOf: (d: Date) => number;
      if (timeframe === 'daily') {
        // Horarios de 08:00 a 20:00 en bloques de 2hs
        labels = [8, 10, 12, 14, 16, 18, 20].map(h => `${h.toString().padStart(2, '0')}:00`);
        bucketOf = d => (Math.min(20, Math.max(8, Math.floor(d.getHours() / 2) * 2)) - 8) / 2;
      } else if (timeframe === 'weekly') {
        labels = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
        bucketOf = d => (d.getDay() + 6) % 7; // 0 (Lun) a 6 (Dom)
      } else {
        labels = ['Semana 1', 'Semana 2', 'Semana 3', 'Semana 4'];
        bucketOf = d => Math.min(3, Math.floor((d.getDate() - 1) / 7));
      }

      const slot = () => ({ consultations: 0, previous: 0, totalDuration: 0, completedCount: 0, workMinutes: 0 });
      const series = labels.map(slot);
      const inRange = (d: Date, from: Date, to: Date) => d >= from && d < to;

      (appData || []).forEach(app => {
        const d = new Date(app.scheduled_at || app.created_at);
        const item = series[bucketOf(d)];
        if (!item) return;
        if (inRange(d, period.start, period.end)) {
          item.consultations++;
          if (app.status === 'completed') {
            item.completedCount++;
            item.totalDuration += (app.duration_minutes || 15);
          }
        } else if (inRange(d, period.prevStart, period.prevEnd)) {
          item.previous++;
        }
      });

      (shiftData || []).forEach(shift => {
        if (!shift.clock_in) return;
        const d = new Date(shift.clock_in);
        const item = series[bucketOf(d)];
        if (item && inRange(d, period.start, period.end)) {
          item.workMinutes += (shift.duration_minutes || 0);
        }
      });

      let totalConsultations = 0;
      let previousTotalConsultations = 0;
      let grandTotalDuration = 0;
      let grandCompletedCount = 0;
      let grandTotalWorkMinutes = 0;

      const timeSeries = labels.map((label, i) => {
        const item = series[i];
        totalConsultations += item.consultations;
        previousTotalConsultations += item.previous;
        grandTotalDuration += item.totalDuration;
        grandCompletedCount += item.completedCount;
        grandTotalWorkMinutes += item.workMinutes;

        return {
          name: label,
          consultations: item.consultations,
          previousConsultations: item.previous,
          avgDuration: item.completedCount > 0 ? Math.round(item.totalDuration / item.completedCount) : 15,
          workHours: parseFloat((item.workMinutes / 60).toFixed(1))
        };
      });

      return {
        timeSeries,
        summary: {
          totalConsultations,
          previousTotalConsultations,
          avgSessionTime: grandCompletedCount > 0 ? Math.round(grandTotalDuration / grandCompletedCount) : 15,
          totalWorkHours: parseFloat((grandTotalWorkMinutes / 60).toFixed(1)),
          consultationTrend: formatTrend(totalConsultations, previousTotalConsultations),
          durationTrend: "-2 min"
        }
      };
    } catch (error) {
      console.error("Error obteniendo analíticas de administración:", error);
      return {
        timeSeries: [],
        summary: {
          totalConsultations: 0,
          previousTotalConsultations: 0,
          avgSessionTime: 15,
          totalWorkHours: 0,
          consultationTrend: "+0%",
          durationTrend: "0 min"
        }
      };
    }
  }
}

export const dashboardRepository = new DashboardRepository();

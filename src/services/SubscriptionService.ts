import { Patient, Plan, SystemSettings } from '../types';

export class SubscriptionService {
  /**
   * Determina si un paciente tiene acceso a una consulta basada en su estado y políticas globales
   */
  canAccessConsultation(patient: Patient, settings: SystemSettings[]): boolean {
    if (patient.planStatus === 'suspended') {
      return false;
    }

    if (patient.paymentStatus === 'paid') {
      return true;
    }

    const policy = settings.find(s => s.key === 'delinquency_policy')?.value || 'block';

    if (policy === 'grace_period') {
      // En una implementación real, aquí chequearíamos la fecha de vencimiento vs hoy
      // Pero por ahora, el estado 'overdue' con política 'grace_period' permite acceso.
      return true;
    }

    return false;
  }

  /**
   * Verifica si el grupo familiar aún tiene cupo de consultas bonificadas
   */
  isQuotaAvailable(patient: Patient, plan: Plan): boolean {
    // Nota: currentPeriodQuotaUsed debe ser el total del grupo familiar (ya consolidado en el repositorio)
    return patient.currentPeriodQuotaUsed < plan.bonifiedConsultations;
  }
}

export const subscriptionService = new SubscriptionService();

import { supabase } from '../services/supabase';

export interface PatientChartProfile {
  fullName: string | null;
  dni: string | null;
  cuil: string | null;
  birthDate: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  locality: string | null;
  neighborhood: string | null;
  city: string | null;
  province: string | null;
  bloodType: string | null;
  planName: string | null;
  planStatus: string | null;
}

export interface PatientChartIntake {
  medicalHistory: string[];
  medicalHistoryOther: string | null;
  healthInsurance: string | null;
  civilStatus: string | null;
  // Sign-up declaration shape: name, dni, cuil, birthDate, parentesco, sexo.
  familyMembers: Record<string, string | undefined>[];
  declaredAt: string;
}

export interface PatientChartGroupMember {
  fullName: string;
  relation: string;
  birthDate: string | null;
  dni: string | null;
}

export interface PatientChartData {
  profile: PatientChartProfile;
  intake: PatientChartIntake | null;
  groupMembers: PatientChartGroupMember[];
}

export class PatientChartRepository {
  async getChartData(patientId: string): Promise<PatientChartData | null> {
    const { data, error } = await supabase.rpc('get_patient_chart_data', { p_patient_id: patientId });

    if (error) {
      console.error(`Error fetching chart data for patient ${patientId}:`, error);
      throw error;
    }

    return (data as PatientChartData | null) ?? null;
  }
}

export const patientChartRepository = new PatientChartRepository();

import { supabase } from '../services/supabase';
import { MedicalRecord } from '../types';

export class MedicalRecordRepository {
  async createMedicalRecord(recordData: Omit<MedicalRecord, 'id' | 'date'>): Promise<MedicalRecord> {
    const { data, error } = await supabase
      .from('medical_records')
      .insert([{
        appointment_id: recordData.appointmentId,
        patient_id: recordData.patientId,
        doctor_id: recordData.doctorId,
        doctor_name: recordData.doctorName,
        diagnosis: recordData.diagnosis,
        notes: recordData.notes,
        type: recordData.type || 'consultation',
        attachments: recordData.attachments || []
      }])
      .select()
      .single();

    if (error) throw error;

    return {
      id: data.id,
      appointmentId: data.appointment_id,
      patientId: data.patient_id,
      doctorId: data.doctor_id,
      doctorName: data.doctor_name,
      date: data.created_at,
      diagnosis: data.diagnosis,
      notes: data.notes,
      type: data.type,
      attachments: data.attachments
    };
  }

  async getRecordsByPatientId(patientId: string): Promise<MedicalRecord[]> {
    const { data, error } = await supabase
      .from('medical_records')
      .select('*')
      .eq('patient_id', patientId)
      .order('created_at', { ascending: false });

    if (error) throw error;

    return data.map((item: any) => ({
      id: item.id,
      appointmentId: item.appointment_id,
      patientId: item.patient_id,
      doctorId: item.doctor_id,
      doctorName: item.doctor_name,
      date: item.created_at,
      diagnosis: item.diagnosis,
      notes: item.notes,
      type: item.type,
      attachments: item.attachments
    }));
  }

  async getRecordByAppointmentId(appointmentId: string): Promise<MedicalRecord | null> {
    const { data, error } = await supabase
      .from('medical_records')
      .select('*')
      .eq('appointment_id', appointmentId)
      .maybeSingle();

    if (error) throw error;
    if (!data) return null;

    return {
      id: data.id,
      appointmentId: data.appointment_id,
      patientId: data.patient_id,
      doctorId: data.doctor_id,
      doctorName: data.doctor_name,
      date: data.created_at,
      diagnosis: data.diagnosis,
      notes: data.notes,
      type: data.type,
      attachments: data.attachments
    };
  }
}

export const medicalRecordRepository = new MedicalRecordRepository();


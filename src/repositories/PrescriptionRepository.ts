import { supabase } from '../services/supabase';
import { Prescription } from '../types';

export class PrescriptionRepository {
  async createPrescription(recordData: Omit<Prescription, 'id' | 'date' | 'status' | 'expirationDate'>): Promise<Prescription> {
    const today = new Date();
    const expDate = new Date(today);
    expDate.setDate(today.getDate() + 30); // 30 days expiration

    const { data, error } = await supabase
      .from('prescriptions')
      .insert([{
        appointment_id: recordData.appointmentId,
        patient_id: recordData.patientId,
        doctor_id: recordData.doctorId,
        doctor_name: recordData.doctorName,
        status: 'active',
        digital_signature: recordData.digitalSignature,
        signature_public_key: recordData.signaturePublicKey,
        expiration_date: expDate.toISOString().split('T')[0],
        medications: recordData.medications,
        notes: recordData.notes
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
      date: data.date,
      status: data.status,
      digitalSignature: data.digital_signature,
      signaturePublicKey: data.signature_public_key,
      expirationDate: data.expiration_date,
      medications: data.medications,
      pdfUrl: data.pdf_url,
      notes: data.notes
    };
  }

  async getPrescriptionsByPatientId(patientId: string): Promise<Prescription[]> {
    const { data, error } = await supabase
      .from('prescriptions')
      .select('*')
      .eq('patient_id', patientId)
      .order('date', { ascending: false });

    if (error) throw error;

    return (data || []).map((item: any) => ({
      id: item.id,
      appointmentId: item.appointment_id,
      patientId: item.patient_id,
      doctorId: item.doctor_id,
      doctorName: item.doctor_name,
      date: item.date,
      status: item.status,
      digitalSignature: item.digital_signature,
      signaturePublicKey: item.signature_public_key,
      expirationDate: item.expiration_date,
      medications: item.medications,
      pdfUrl: item.pdf_url,
      notes: item.notes
    }));
  }

  async getPrescriptionByAppointmentId(appointmentId: string): Promise<Prescription | null> {
    const { data, error } = await supabase
      .from('prescriptions')
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
      date: data.date,
      status: data.status,
      digitalSignature: data.digital_signature,
      signaturePublicKey: data.signature_public_key,
      expirationDate: data.expiration_date,
      medications: data.medications,
      pdfUrl: data.pdf_url,
      notes: data.notes
    };
  }
}

export const prescriptionRepository = new PrescriptionRepository();


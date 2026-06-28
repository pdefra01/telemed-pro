import { supabase } from '../services/supabase';
import { Appointment } from '../types';
import { generateUUID } from '../utils/uuid';
import { affiliateRepository } from './AffiliateRepository';

export class AppointmentRepository {
  /**
   * Obtiene todos los turnos confirmados/pendientes para un paciente específico
   */
  async getPatientAppointments(patientId: string): Promise<Appointment[]> {
    const { data, error } = await supabase
      .from('appointments')
      .select(`
        *,
        doctor:profiles!doctor_id(full_name)
      `)
      .eq('patient_id', patientId)
      .neq('status', 'cancelled')
      .order('scheduled_at', { ascending: true });

    if (error) {
      console.error("Error obteniendo turnos:", error);
      throw error;
    }

    return (data || []).map(row => ({
      id: row.id,
      patientId: row.patient_id,
      patientName: "", // Se llena desde Auth/App context
      doctorId: row.doctor_id,
      doctorName: row.doctor?.full_name || "Doctor",
      date: new Date(row.scheduled_at).toISOString().split('T')[0],
      time: new Date(row.scheduled_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}),
      status: row.status,
      type: 'video', // Por defecto en este MVP
      consultationMetadata: row.consultation_metadata || {},
    }));
  }

  /**
   * Obtiene todos los turnos para un médico específico
   */
  async getDoctorAppointments(
    doctorId: string,
    filters?: { status?: ('pending' | 'confirmed' | 'in_progress' | 'completed' | 'cancelled')[] }
  ): Promise<Appointment[]> {
    let query = supabase
      .from('appointments')
      .select(`
        *,
        patient:profiles!patient_id(full_name)
      `)
      .eq('doctor_id', doctorId);

    // Aplicar filtros de estado si existen
    if (filters?.status && filters.status.length > 0) {
      query = query.in('status', filters.status);
    } else {
      query = query.neq('status', 'cancelled'); // Por defecto, todo lo no cancelado
    }

    const { data, error } = await query.order('scheduled_at', { ascending: true });

    if (error) {
      console.error("Error obteniendo turnos de doctor:", error);
      throw error;
    }

    return (data || []).map(row => ({
      id: row.id,
      patientId: row.patient_id,
      patientName: row.patient?.full_name || "Paciente",
      doctorId: row.doctor_id,
      doctorName: "", // Llenado en el contexto
      date: new Date(row.scheduled_at).toISOString().split('T')[0],
      time: new Date(row.scheduled_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}),
      status: row.status,
      type: 'video',
      consultationMetadata: row.consultation_metadata || {},
    }));
  }

  /**
   * Crea un nuevo turno en la base de datos
   */
  async createAppointment(data: {
    patient_id: string;
    doctor_id: string;
    scheduled_at: string;
    specialty: string;
    status: 'pending' | 'confirmed';
  }): Promise<any> {
    // 1. Verificar solapamiento (Overlap check)
    const { data: overlaps, error: overlapError } = await supabase
      .from('appointments')
      .select('id')
      .eq('doctor_id', data.doctor_id)
      .eq('scheduled_at', data.scheduled_at)
      .neq('status', 'cancelled');

    if (overlapError) throw overlapError;
    if (overlaps && overlaps.length > 0) {
      throw new Error("El profesional ya tiene un turno asignado para este horario. Por favor, seleccioná otro momento.");
    }

    const { data: insertedData, error } = await supabase
      .from('appointments')
      .insert({
        patient_id: data.patient_id,
        doctor_id: data.doctor_id,
        scheduled_at: data.scheduled_at,
        specialty: data.specialty,
        status: data.status,
        livekit_room_name: `room-${data.patient_id.substring(0, 5)}-${Date.now().toString().slice(-5)}`
      })
      .select()
      .single();

    if (error) {
      console.error("Error creando turno:", error);
      throw error;
    }

    // Increment patient's consultation quota counter
    try {
      await affiliateRepository.incrementQuotaUsed(data.patient_id);
    } catch (qErr) {
      console.error("Error incrementando cupo:", qErr);
    }

    return insertedData;
  }

  /**
   * Crea un turno de prueba para el MVP, conectando al paciente actual con el médico más recientemente registrado
   * o creando un médico falso si no hay ninguno.
   */
  async createDemoAppointment(patientId: string): Promise<void> {
    // 1. Buscar un médico (el último que se registró, para que las pruebas sean fáciles si recién te creás la cuenta)
    let { data: doctors } = await supabase.from('profiles').select('id').eq('role', 'doctor').order('created_at', { ascending: false }).limit(1);
    
    let doctorId;
    if (!doctors || doctors.length === 0) {
      // Crear medico falso para pruebas
      const newDoctorId = generateUUID();
      // Need to use auth.admin to create user if we wanted a real auth user, 
      // but for this MVP we can just insert into profiles if RLS allows or temporarily bypass it.
      // Wait, RLS on profiles only allows inserting IF auth.uid() == id. 
      // We can't easily create another profile from the client.
      // Better approach: use a hardcoded UUID for the demo doctor and hope it works, 
      // or call a Supabase RPC.
      // Let's just insert into appointments with a dummy UUID, it might fail foreign key constraint.
      throw new Error("Por favor, registrá un usuario con rol 'Médico' primero para poder asignarte turnos.");
    } else {
      doctorId = doctors[0].id;
    }

    const { error } = await supabase.from('appointments').insert({
      patient_id: patientId,
      doctor_id: doctorId,
      scheduled_at: new Date(Date.now() + 1000 * 60 * 60 * 24).toISOString(), // Mañana
      status: 'confirmed',
      livekit_room_name: `room-demo-${patientId.substring(0,6)}`
    });

    if (error) {
      console.error("Error creando turno demo:", error);
      throw error;
    }

    // Increment patient's consultation quota counter
    try {
      await affiliateRepository.incrementQuotaUsed(patientId);
    } catch (qErr) {
      console.error("Error incrementando cupo en turno demo:", qErr);
    }
  }

  /**
   * Guarda notas médicas para un turno específico
   */
  async saveAppointmentNotes(appointmentId: string, notes: string): Promise<void> {
    const { error } = await supabase
      .from('appointments')
      .update({ notes: notes })
      .eq('id', appointmentId);

    if (error) {
      console.error(`Error guardando notas para turno ${appointmentId}:`, error);
      throw error;
    }
  }

  /**
   * Marca un turno como iniciado (en progreso)
   */
  async startConsultation(appointmentId: string): Promise<void> {
    const { error } = await supabase
      .from('appointments')
      .update({ 
        status: 'in_progress',
        consultation_metadata: {
          startedAt: new Date().toISOString()
        }
      })
      .eq('id', appointmentId);

    if (error) {
      console.error(`Error iniciando turno ${appointmentId}:`, error);
      throw error;
    }
  }

  /**
   * Marca un turno como completado
   */
  async completeAppointment(appointmentId: string): Promise<void> {
    const { error } = await supabase
      .from('appointments')
      .update({ 
        status: 'completed',
        consultation_metadata: {
          endedAt: new Date().toISOString()
        }
      })
      .eq('id', appointmentId);

    if (error) {
      console.error(`Error completando turno ${appointmentId}:`, error);
      throw error;
    }
  }

  /**
   * Obtiene un turno por su ID
   */
  async getAppointmentById(appointmentId: string): Promise<Appointment | null> {
    const { data, error } = await supabase
      .from('appointments')
      .select(`
        *,
        patient:profiles!patient_id(full_name),
        doctor:profiles!doctor_id(full_name)
      `)
      .eq('id', appointmentId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null; // No results
      console.error(`Error obteniendo turno ${appointmentId}:`, error);
      throw error;
    }

    return {
      id: data.id,
      patientId: data.patient_id,
      patientName: data.patient?.full_name || "Paciente",
      doctorId: data.doctor_id,
      doctorName: data.doctor?.full_name || "Doctor",
      date: new Date(data.scheduled_at).toISOString().split('T')[0],
      time: new Date(data.scheduled_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}),
      status: data.status,
      type: 'video', // Por defecto en este MVP
      notes: data.notes || '', // Agregado para soportar leer notas pre-existentes
      consultationMetadata: data.consultation_metadata || {},
    } as any; 
  }
}

export const appointmentRepository = new AppointmentRepository();
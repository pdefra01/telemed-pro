import { supabase } from '../services/supabase';
import { Doctor } from '../types';
import { generateUUID } from '../utils/uuid';

export class DoctorRepository {
  /**
   * Obtiene todos los médicos activos
   */
  async getAllDoctors(): Promise<Doctor[]> {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('role', 'doctor')
      .eq('is_active', true)
      .order('full_name', { ascending: true });

    if (error) {
      console.error("Error obteniendo médicos:", error);
      throw error;
    }

    return (data || []).map(row => this.mapProfileToDoctor(row));
  }

  /**
   * Obtiene médicos filtrados por especialidad
   */
  async getDoctorsBySpecialty(specialty: string): Promise<Doctor[]> {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('role', 'doctor')
      .eq('is_active', true)
      .eq('specialty', specialty)
      .order('full_name', { ascending: true });

    if (error) {
      console.error(`Error obteniendo médicos para ${specialty}:`, error);
      throw error;
    }

    return (data || []).map(row => this.mapProfileToDoctor(row));
  }

  /**
   * Obtiene la lista única de especialidades de los médicos registrados
   */
  async getSpecialties(): Promise<string[]> {
    const { data, error } = await supabase
      .from('profiles')
      .select('specialty')
      .eq('role', 'doctor')
      .eq('is_active', true)
      .not('specialty', 'is', null);

    if (error) {
      console.error("Error obteniendo especialidades:", error);
      throw error;
    }

    // Extraer especialidades únicas
    const specialties = data.map(row => row.specialty);
    return Array.from(new Set(specialties)).sort();
  }

  /**
   * Crea un nuevo médico en la base de datos
   */
  async createDoctor(data: Partial<Doctor>): Promise<Doctor> {
    const profileData = {
      id: generateUUID(),
      role: 'doctor',
      full_name: data.name,
      email: data.email,
      specialty: data.specialty,
      availability: data.availability || [],
      is_active: true
    };

    const { data: result, error } = await supabase
      .from('profiles')
      .insert([profileData])
      .select()
      .single();

    if (error) {
      console.error("Error creando médico:", error);
      throw error;
    }

    return this.mapProfileToDoctor(result);
  }

  /**
   * Actualiza los datos de un médico
   */
  async updateDoctor(id: string, data: Partial<Doctor>): Promise<Doctor> {
    const profileData: any = {};
    if (data.name !== undefined) profileData.full_name = data.name;
    if (data.email !== undefined) profileData.email = data.email;
    if (data.specialty !== undefined) profileData.specialty = data.specialty;
    if (data.availability !== undefined) profileData.availability = data.availability;
    if (data.isVerified !== undefined) profileData.is_verified = data.isVerified;

    const { data: result, error } = await supabase
      .from('profiles')
      .update(profileData)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error(`Error actualizando médico ${id}:`, error);
      throw error;
    }

    return this.mapProfileToDoctor(result);
  }

  /**
   * Desactiva a un médico (Soft Delete)
   */
  async deactivateDoctor(id: string): Promise<void> {
    const { error } = await supabase
      .from('profiles')
      .update({ is_active: false })
      .eq('id', id);

    if (error) {
      console.error(`Error desactivando médico ${id}:`, error);
      throw error;
    }
  }

  /**
   * Reactiva a un médico
   */
  async reactivateDoctor(id: string): Promise<void> {
    const { error } = await supabase
      .from('profiles')
      .update({ is_active: true })
      .eq('id', id);

    if (error) {
      console.error(`Error reactivando médico ${id}:`, error);
      throw error;
    }
  }

  private mapProfileToDoctor(row: any): Doctor {
    return {
      id: row.id,
      name: row.full_name,
      email: row.email || '',
      role: 'doctor',
      specialty: row.specialty || 'General',
      rating: row.rating || 5.0,
      reviewCount: row.review_count || 0,
      isVerified: row.is_verified || false,
      availability: row.availability || [],
      avatarUrl: row.avatar_url,
      metrics: row.metrics
    };
  }
}

export const doctorRepository = new DoctorRepository();

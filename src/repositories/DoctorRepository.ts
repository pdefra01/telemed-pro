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
   * Crea un nuevo médico vía el endpoint de admin del servidor.
   * Esto crea el usuario en auth.users con contraseña y el trigger
   * handle_new_user crea automáticamente el perfil en public.profiles.
   */
  async createDoctor(data: Partial<Doctor> & { password: string }): Promise<Doctor> {
    const response = await fetch('/api/create-staff', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: data.email,
        password: data.password,
        full_name: data.name,
        role: 'doctor',
        specialty: data.specialty,
      }),
    });

    const json = await response.json();

    if (!response.ok) {
      throw new Error(json.error || 'Error al crear el médico');
    }

    // El trigger ya insertó el perfil; lo buscamos para devolverlo mapeado
    const { data: profile, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', json.id)
      .single();

    if (error || !profile) {
      throw new Error('Médico creado en Auth pero no se pudo obtener su perfil');
    }

    // Si el trigger no copió la specialty aún, la actualizamos
    if (data.specialty && !profile.specialty) {
      await supabase
        .from('profiles')
        .update({ specialty: data.specialty, availability: [] })
        .eq('id', json.id);
      profile.specialty = data.specialty;
      profile.availability = [];
    }

    return this.mapProfileToDoctor(profile);
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
    if (data.licenseNumber !== undefined) profileData.license_number = data.licenseNumber;
    if (data.provincialLicense !== undefined) profileData.provincial_license = data.provincialLicense;
    if (data.cuit !== undefined) profileData.cuit = data.cuit;
    if (data.phone !== undefined) profileData.phone = data.phone;
    if (data.university !== undefined) profileData.university = data.university;
    if (data.graduationYear !== undefined) profileData.graduation_year = data.graduationYear;
    if (data.consultationFee !== undefined) profileData.consultation_fee = data.consultationFee;
    if (data.contractStartDate !== undefined) profileData.contract_start_date = data.contractStartDate;
    if (data.contractEndDate !== undefined) profileData.contract_end_date = data.contractEndDate;

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
      licenseNumber: row.license_number,
      provincialLicense: row.provincial_license,
      cuit: row.cuit,
      phone: row.phone,
      university: row.university,
      graduationYear: row.graduation_year,
      consultationFee: row.consultation_fee ? parseFloat(row.consultation_fee) : 0,
      contractStartDate: row.contract_start_date,
      contractEndDate: row.contract_end_date,
      avatarUrl: row.avatar_url,
      metrics: row.metrics
    };
  }
}

export const doctorRepository = new DoctorRepository();

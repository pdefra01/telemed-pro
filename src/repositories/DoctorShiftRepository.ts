import { supabase } from '../services/supabase';
import { DoctorWorkShift, OfficeLocation } from '../types';
import { officeLocationRepository } from './OfficeLocationRepository';

export class DoctorShiftRepository {
  async getActiveShift(doctorId: string): Promise<DoctorWorkShift | null> {
    const { data, error } = await supabase
      .from('doctor_work_shifts')
      .select('*, office_locations(name)')
      .eq('doctor_id', doctorId)
      .eq('status', 'active')
      .order('clock_in', { ascending: false })
      .maybeSingle();

    if (error) {
      console.error("Error fetching active shift:", error);
      return null;
    }

    if (!data) return null;

    return {
      id: data.id,
      doctorId: data.doctor_id,
      officeLocationId: data.office_location_id,
      clockIn: data.clock_in,
      clockOut: data.clock_out,
      durationMinutes: data.duration_minutes,
      ipAddress: data.ip_address,
      status: data.status,
      officeName: data.office_locations?.name || 'Oficina'
    };
  }

  async clockIn(doctorId: string): Promise<{ shift: DoctorWorkShift; matchedOffice: OfficeLocation }> {
    // 1. Detect client IP
    const currentIp = await officeLocationRepository.detectCurrentIp();

    // 2. Validate against active office locations
    const offices = await officeLocationRepository.getAllOffices();
    const activeOffices = offices.filter(o => o.isActive);

    // Check match by IP or localhost/dev environment fallback
    const isDev = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' || window.location.hostname.startsWith('192.168.');
    
    let matchedOffice = activeOffices.find(o => o.publicIp === currentIp);

    if (!matchedOffice && isDev) {
      // Fallback for local testing
      matchedOffice = activeOffices[0] || {
        id: 'dev-office',
        name: 'Oficina de Desarrollo',
        publicIp: currentIp,
        isActive: true
      };
    }

    if (!matchedOffice) {
      throw new Error(`Acceso denegado: Tu IP actual (${currentIp}) no pertenece a ninguna oficina autorizada.`);
    }

    // Close any unclosed shifts prior to creating a new one
    await this.autoCloseOldShifts(doctorId);

    // 3. Create active shift
    const { data, error } = await supabase
      .from('doctor_work_shifts')
      .insert({
        doctor_id: doctorId,
        office_location_id: matchedOffice.id === 'dev-office' ? null : matchedOffice.id,
        clock_in: new Date().toISOString(),
        ip_address: currentIp,
        status: 'active'
      })
      .select()
      .single();

    if (error) throw error;

    return {
      shift: {
        id: data.id,
        doctorId: data.doctor_id,
        officeLocationId: data.office_location_id,
        clockIn: data.clock_in,
        ipAddress: data.ip_address,
        status: data.status,
        officeName: matchedOffice.name
      },
      matchedOffice
    };
  }

  async clockOut(shiftId: string): Promise<DoctorWorkShift> {
    const { data: currentShift, error: fetchErr } = await supabase
      .from('doctor_work_shifts')
      .select('*')
      .eq('id', shiftId)
      .single();

    if (fetchErr || !currentShift) throw new Error("No se encontró la jornada activa.");

    const now = new Date();
    const clockInDate = new Date(currentShift.clock_in);
    const diffMs = now.getTime() - clockInDate.getTime();
    const durationMinutes = Math.max(1, Math.round(diffMs / (1000 * 60)));

    const { data, error } = await supabase
      .from('doctor_work_shifts')
      .update({
        clock_out: now.toISOString(),
        duration_minutes: durationMinutes,
        status: 'completed'
      })
      .eq('id', shiftId)
      .select()
      .single();

    if (error) throw error;

    return {
      id: data.id,
      doctorId: data.doctor_id,
      officeLocationId: data.office_location_id,
      clockIn: data.clock_in,
      clockOut: data.clock_out,
      durationMinutes: data.duration_minutes,
      ipAddress: data.ip_address,
      status: data.status
    };
  }

  async getAllDoctorShifts(): Promise<any[]> {
    const { data, error } = await supabase
      .from('doctor_work_shifts')
      .select('*, profiles:doctor_id(full_name, email, specialty), office_locations(name)')
      .order('clock_in', { ascending: false });

    if (error) throw error;

    return (data || []).map(row => ({
      id: row.id,
      doctorId: row.doctor_id,
      doctorName: row.profiles?.full_name || 'Médico',
      doctorEmail: row.profiles?.email || '',
      specialty: row.profiles?.specialty || 'General',
      officeName: row.office_locations?.name || 'Oficina Registrada',
      clockIn: row.clock_in,
      clockOut: row.clock_out,
      durationMinutes: row.duration_minutes,
      ipAddress: row.ip_address,
      status: row.status
    }));
  }

  private async autoCloseOldShifts(doctorId: string): Promise<void> {
    const { data } = await supabase
      .from('doctor_work_shifts')
      .select('id, clock_in')
      .eq('doctor_id', doctorId)
      .eq('status', 'active');

    if (data && data.length > 0) {
      const now = new Date();
      for (const old of data) {
        const clockInDate = new Date(old.clock_in);
        const diffMs = now.getTime() - clockInDate.getTime();
        const durationMinutes = Math.max(1, Math.round(diffMs / (1000 * 60)));
        await supabase
          .from('doctor_work_shifts')
          .update({ clock_out: now.toISOString(), duration_minutes: durationMinutes, status: 'completed' })
          .eq('id', old.id);
      }
    }
  }
}

export const doctorShiftRepository = new DoctorShiftRepository();

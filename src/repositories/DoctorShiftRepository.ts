import { supabase } from '../services/supabase';
import { DoctorWorkShift, OfficeLocation } from '../types';
import { officeLocationRepository } from './OfficeLocationRepository';
import { calculateDistanceMeters } from '../utils/geo';

const MAX_SHIFT_HOURS = 8;

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

    const clockInDate = new Date(data.clock_in);
    const shiftAgeHours = (Date.now() - clockInDate.getTime()) / (1000 * 60 * 60);

    if (shiftAgeHours > MAX_SHIFT_HOURS) {
      await supabase
        .from('doctor_work_shifts')
        .update({
          status: 'abandoned',
          clock_out: new Date().toISOString(),
          duration_minutes: null,
        })
        .eq('id', data.id);

      return null;
    }

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
    // 1. Fetch active office locations
    const offices = await officeLocationRepository.getAllOffices();
    const activeOffices = offices.filter(o => o.isActive);

    // Dev/local environment: skip GPS entirely so local development isn't
    // blocked by lacking a real device location or registered coordinates.
    const isDev = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' || window.location.hostname.startsWith('192.168.');

    let matchedOffice: OfficeLocation | undefined;

    if (isDev) {
      matchedOffice = activeOffices[0] || {
        id: 'dev-office',
        name: 'Oficina de Desarrollo',
        latitude: 0,
        longitude: 0,
        radiusMeters: 150,
        isActive: true
      };
    } else {
      // 2. Get doctor's current GPS position (rejection messages are already
      // user-facing and propagate untouched).
      const position = await officeLocationRepository.getCurrentPosition();

      // 3. Find the nearest active office whose radius contains the doctor's position.
      let nearestDistance = Infinity;
      let matchedDistance = Infinity;

      for (const office of activeOffices) {
        const distance = calculateDistanceMeters(
          position.latitude,
          position.longitude,
          office.latitude,
          office.longitude
        );

        if (distance < nearestDistance) {
          nearestDistance = distance;
        }

        if (distance <= office.radiusMeters && distance < matchedDistance) {
          matchedOffice = office;
          matchedDistance = distance;
        }
      }

      if (!matchedOffice) {
        throw new Error(`Acceso denegado: no estás dentro del radio de ninguna oficina autorizada. La oficina más cercana está a ${Math.round(nearestDistance)}m.`);
      }
    }

    // Close any unclosed shifts prior to creating a new one
    await this.autoCloseOldShifts(doctorId);

    // 4. Create active shift
    const { data, error } = await supabase
      .from('doctor_work_shifts')
      .insert({
        doctor_id: doctorId,
        office_location_id: matchedOffice.id === 'dev-office' ? null : matchedOffice.id,
        clock_in: new Date().toISOString(),
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

  /**
   * Fetches past shift history (any status), optionally scoped by doctor,
   * office, and/or a clock_in date range. Used by the admin attendance page —
   * all filters are optional so an empty object returns every shift ever
   * recorded, most recent first.
   */
  async getShiftHistory(filters: {
    doctorId?: string;
    officeLocationId?: string;
    from?: string;
    to?: string;
  }): Promise<(DoctorWorkShift & { doctorName: string })[]> {
    let query = supabase
      .from('doctor_work_shifts')
      .select('*, doctor:profiles!doctor_id(full_name), office_locations(name)');

    if (filters.doctorId) {
      query = query.eq('doctor_id', filters.doctorId);
    }
    if (filters.officeLocationId) {
      query = query.eq('office_location_id', filters.officeLocationId);
    }
    if (filters.from) {
      query = query.gte('clock_in', filters.from);
    }
    if (filters.to) {
      query = query.lte('clock_in', filters.to);
    }

    const { data, error } = await query.order('clock_in', { ascending: false });

    if (error) {
      console.error("Error fetching shift history:", error);
      throw error;
    }

    return (data || []).map((row: any) => ({
      id: row.id,
      doctorId: row.doctor_id,
      officeLocationId: row.office_location_id ?? undefined,
      clockIn: row.clock_in,
      clockOut: row.clock_out ?? undefined,
      durationMinutes: row.duration_minutes ?? undefined,
      ipAddress: row.ip_address ?? undefined,
      status: row.status,
      officeName: row.office_locations?.name || 'Oficina',
      doctorName: row.doctor?.full_name || 'Médico',
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
      const updates = data.map(old => {
        const clockInDate = new Date(old.clock_in);
        const diffMs = now.getTime() - clockInDate.getTime();
        const diffHours = diffMs / (1000 * 60 * 60);

        if (diffHours > MAX_SHIFT_HOURS) {
          return supabase
            .from('doctor_work_shifts')
            .update({ clock_out: now.toISOString(), duration_minutes: null, status: 'abandoned' })
            .eq('id', old.id);
        }

        const durationMinutes = Math.max(1, Math.round(diffMs / (1000 * 60)));
        return supabase
          .from('doctor_work_shifts')
          .update({ clock_out: now.toISOString(), duration_minutes: durationMinutes, status: 'completed' })
          .eq('id', old.id);
      });
      await Promise.all(updates);
    }
  }
}

export const doctorShiftRepository = new DoctorShiftRepository();

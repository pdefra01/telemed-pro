import { supabase } from '../services/supabase';
import { OfficeLocation } from '../types';

export class OfficeLocationRepository {
  async getAllOffices(): Promise<OfficeLocation[]> {
    const { data, error } = await supabase
      .from('office_locations')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;

    return (data || []).map(row => ({
      id: row.id,
      name: row.name,
      latitude: row.latitude,
      longitude: row.longitude,
      radiusMeters: row.radius_meters,
      isActive: row.is_active,
      createdAt: row.created_at
    }));
  }

  async createOffice(name: string, latitude: number, longitude: number, radiusMeters: number): Promise<OfficeLocation> {
    const { data, error } = await supabase
      .from('office_locations')
      .insert({
        name,
        latitude,
        longitude,
        radius_meters: radiusMeters,
        is_active: true
      })
      .select()
      .single();

    if (error) throw error;

    return {
      id: data.id,
      name: data.name,
      latitude: data.latitude,
      longitude: data.longitude,
      radiusMeters: data.radius_meters,
      isActive: data.is_active,
      createdAt: data.created_at
    };
  }

  async toggleOfficeStatus(id: string, isActive: boolean): Promise<void> {
    const { error } = await supabase
      .from('office_locations')
      .update({ is_active: isActive, updated_at: new Date().toISOString() })
      .eq('id', id);

    if (error) throw error;
  }

  async deleteOffice(id: string): Promise<void> {
    const { error } = await supabase
      .from('office_locations')
      .delete()
      .eq('id', id);

    if (error) throw error;
  }

  /**
   * Wraps the browser Geolocation API in a Promise, surfacing clear
   * Spanish-language error messages so callers can display them directly.
   */
  async getCurrentPosition(): Promise<{ latitude: number; longitude: number }> {
    if (!navigator.geolocation) {
      throw new Error('Tu navegador no soporta geolocalización.');
    }

    return new Promise((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          resolve({
            latitude: position.coords.latitude,
            longitude: position.coords.longitude
          });
        },
        (error) => {
          if (error.code === error.PERMISSION_DENIED) {
            reject(new Error('Activá los permisos de ubicación en tu navegador para poder fichar.'));
          } else {
            reject(new Error('No pudimos obtener tu ubicación. Intentá nuevamente.'));
          }
        },
        { timeout: 8000, enableHighAccuracy: true }
      );
    });
  }
}

export const officeLocationRepository = new OfficeLocationRepository();

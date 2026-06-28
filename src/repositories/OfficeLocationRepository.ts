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
      publicIp: row.public_ip,
      isActive: row.is_active,
      createdAt: row.created_at
    }));
  }

  async createOffice(name: string, publicIp: string): Promise<OfficeLocation> {
    const { data, error } = await supabase
      .from('office_locations')
      .insert({
        name,
        public_ip: publicIp,
        is_active: true
      })
      .select()
      .single();

    if (error) throw error;

    return {
      id: data.id,
      name: data.name,
      publicIp: data.public_ip,
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
   * Helper to detect current client public IP via public API or fallback
   */
  async detectCurrentIp(): Promise<string> {
    try {
      const res = await fetch('https://api.ipify.org?format=json');
      const data = await res.json();
      return data.ip || '127.0.0.1';
    } catch (err) {
      console.warn("Failed to detect IP via ipify, using fallback:", err);
      return window.location.hostname === 'localhost' ? '127.0.0.1' : '192.168.0.141';
    }
  }
}

export const officeLocationRepository = new OfficeLocationRepository();

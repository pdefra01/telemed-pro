import { supabase } from '../services/supabase';
import { SystemSettings } from '../types';

export class SystemSettingsRepository {
  async getByKey(key: string): Promise<any> {
    const { data, error } = await supabase
      .from('system_settings')
      .select('value')
      .eq('key', key)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null; // Not found
      throw error;
    }
    return data?.value;
  }

  async update(key: string, value: any): Promise<void> {
    const { error } = await supabase
      .from('system_settings')
      .upsert({ key, value }, { onConflict: 'key' });

    if (error) throw error;
  }
}

export const systemSettingsRepository = new SystemSettingsRepository();

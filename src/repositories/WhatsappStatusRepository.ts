import { supabase } from '../services/supabase';

export class WhatsappStatusRepository {
  /** WAHA session status of the company WhatsApp line (admin only). */
  async getStatus(): Promise<string> {
    const { data: { session } } = await supabase.auth.getSession();
    const response = await fetch('/api/admin/whatsapp-status', {
      headers: { Authorization: `Bearer ${session?.access_token || ''}` },
    });
    if (!response.ok) throw new Error('No pudimos consultar el estado de WhatsApp.');
    const body = await response.json();
    return String(body?.status ?? 'UNREACHABLE');
  }
}

export const whatsappStatusRepository = new WhatsappStatusRepository();

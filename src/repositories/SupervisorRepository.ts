import { supabase } from '../services/supabase';

export interface Supervisor {
  id: string;
  name: string;
  email: string;
  phone?: string;
}

export interface TeamAdvisor {
  id: string;
  name: string;
  email: string;
  supervisorId: string | null;
}

export interface NewSupervisor {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  phone?: string;
}

/**
 * Commercial hierarchy administration. The admin reads and assigns everything;
 * a supervisor reads their own team (RLS) to act on it. Reads and the assignment
 * go straight to `profiles` (admin RLS; a database trigger validates that the
 * supervisor really holds the supervisor role). Account creation needs the
 * server because it creates an auth user.
 */
export class SupervisorRepository {
  async listSupervisors(): Promise<Supervisor[]> {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, full_name, email, phone')
      .eq('role', 'supervisor')
      .order('full_name', { ascending: true });

    if (error) throw error;
    return (data || []).map((row: any) => ({
      id: row.id,
      name: row.full_name,
      email: row.email,
      phone: row.phone ?? undefined,
    }));
  }

  /** Every advisor (admin), or only one supervisor's team when `supervisorId` is given. */
  async listAdvisors(filter: { supervisorId?: string } = {}): Promise<TeamAdvisor[]> {
    let query = supabase
      .from('profiles')
      .select('id, full_name, email, supervisor_id')
      .eq('role', 'advisor');
    if (filter.supervisorId) query = query.eq('supervisor_id', filter.supervisorId);

    const { data, error } = await query.order('full_name', { ascending: true });

    if (error) throw error;
    return (data || []).map((row: any) => ({
      id: row.id,
      name: row.full_name,
      email: row.email,
      supervisorId: row.supervisor_id ?? null,
    }));
  }

  /** Puts an advisor on a supervisor's team, or releases them with `null`. */
  async assignAdvisor(advisorId: string, supervisorId: string | null): Promise<void> {
    const { error } = await supabase
      .from('profiles')
      .update({ supervisor_id: supervisorId })
      .eq('id', advisorId);

    if (error) throw error;
  }

  /** Creates the supervisor account on the server and returns its id. */
  async createSupervisor(input: NewSupervisor): Promise<string> {
    const { data: { session } } = await supabase.auth.getSession();
    const response = await fetch('/api/create-supervisor', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session?.access_token || ''}`,
      },
      body: JSON.stringify(input),
    });

    const result = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(result.error || 'No se pudo crear el supervisor.');
    }

    return result.id;
  }
}

export const supervisorRepository = new SupervisorRepository();

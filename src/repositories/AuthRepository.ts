import { supabase } from '../services/supabase';
import { User, Role } from '../types';

export class AuthRepository {
  /**
   * Registra un nuevo paciente utilizando un email falso basado en su DNI/Teléfono
   */
  async registerPatient(authEmail: string, password: string, fullName: string, role: Role): Promise<User> {
    const { data, error: signUpError } = await supabase.auth.signUp({
      email: authEmail,
      password: password,
      options: {
        data: {
          full_name: fullName,
          role: role,
        }
      }
    });

    if (signUpError) {
      if (signUpError.message.includes('User already registered')) {
        throw new Error('Ese documento/correo ya está registrado. Por favor, iniciá sesión.');
      }
      throw signUpError;
    }
    if (!data.user) throw new Error("Error desconocido al crear el usuario.");

    // Extraer DNI para devolver el objeto completo
    let extractedDni = '';
    if (authEmail.endsWith('@medinex-paciente.com')) {
      extractedDni = authEmail.split('@')[0];
    }

    return {
      id: data.user.id,
      name: fullName,
      email: authEmail,
      role: role,
      dni: extractedDni,
    };
  }

  /**
   * Inicia sesión y recupera los datos del perfil
   */
  async login(authEmail: string, password: string, role: Role): Promise<User> {
    const { data, error: signInError } = await supabase.auth.signInWithPassword({
      email: authEmail,
      password: password,
    });

    if (signInError) {
      if (signInError.message.includes('Invalid login credentials')) {
        throw new Error('Credenciales incorrectas. Verificá tu documento y contraseña.');
      }
      throw signInError;
    }
    if (!data.user) throw new Error("Error al iniciar sesión.");

    // Traer datos extras del perfil
    const { data: profileData, error: profileError } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', data.user.id)
      .single();

    if (profileError) {
      console.warn("No se encontró el perfil, intentando crearlo (Self-healing)...", data.user.id);
      
      const { error: insertError } = await supabase
        .from('profiles')
        .insert({
          id: data.user.id,
          role: role,
          full_name: "Usuario Autogenerado",
        });

      if (insertError) {
        console.error("Error al autogenerar perfil:", insertError);
        throw new Error("Error en la base de datos: Usuario sin perfil asociado.");
      }

      return {
        id: data.user.id,
        name: "Usuario Autogenerado",
        email: authEmail,
        role: role,
        planStatus: 'active',
        paymentStatus: 'paid',
        currentPeriodQuotaUsed: 0,
      } as any;
    }

    return {
      id: data.user.id,
      name: profileData.full_name || 'Paciente',
      email: authEmail,
      role: profileData.role as Role,
      avatarUrl: profileData.avatar_url,
      dni: profileData.dni,
      planName: profileData.plan_name || 'Plan Global',
      bloodType: profileData.blood_type,
      credentialHash: profileData.credential_hash,
      phone: profileData.phone,
      planStatus: profileData.plan_status || 'active',
      paymentStatus: profileData.payment_status || 'paid',
      currentPeriodQuotaUsed: profileData.current_period_quota_used || 0,
    } as any;
  }

  async logout(): Promise<void> {
    await supabase.auth.signOut();
  }
}

export const authRepository = new AuthRepository();
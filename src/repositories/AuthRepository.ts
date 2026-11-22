import { clearStoredAuthSession, supabase } from '../services/supabase';
import { User, Role } from '../types';

export class AuthRepository {
  /**
   * Registra un nuevo paciente utilizando un email falso basado en su DNI/Teléfono
   */
  async registerPatient(authEmail: string, password: string, fullName: string, role: Role, dni?: string): Promise<User> {
    const { data, error: signUpError } = await supabase.auth.signUp({
      email: authEmail,
      password: password,
      options: {
        data: {
          full_name: fullName,
          role: role,
          dni: dni,
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
    let extractedDni = dni || '';
    if (!extractedDni && authEmail.endsWith('@medinex-paciente.com')) {
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
    if (import.meta.env.DEV && authEmail.includes('35123456')) {
      return {
        id: 'demo-p1',
        name: 'Carlos Gutiérrez',
        email: authEmail,
        role: role || 'patient',
        dni: '35.123.456',
        phone: '+54 9 11 1234-5678',
        planName: 'Plan Total',
        planStatus: 'active',
        paymentStatus: 'current',
      } as User;
    }

    try {
      const { data, error: signInError } = await supabase.auth.signInWithPassword({
        email: authEmail,
        password: password,
      });

      if (signInError) {
        if (signInError.message.includes('Invalid login credentials')) {
          const invalidCredentialsError: Error & { code?: string } = new Error('Credenciales incorrectas. Verificá tu documento y contraseña.');
          invalidCredentialsError.code = 'invalid_credentials';
          throw invalidCredentialsError;
        }
        // The cancellation sweep bans the affiliate in Supabase Auth, so GoTrue
        // rejects the login before the profile check below can explain it.
        if ((signInError as { code?: string }).code === 'user_banned' || /banned/i.test(signInError.message)) {
          throw new Error("Tu afiliación fue dada de baja. Si querés volver a afiliarte, contactate con administración.");
        }
        throw signInError;
      }
      if (!data.user) throw new Error("Error al iniciar sesión.");

      // A blocked login must not leave the session from signInWithPassword alive
      // (odd/tasks/login-block-fail-closed.md, S2). signOut() reports server or
      // network failures as { error } and keeps the stored session, for every
      // scope, so clear the stored session directly in that case (S3).
      const rejectLogin = async (message: string): Promise<never> => {
        try {
          const { error: signOutError } = await supabase.auth.signOut();
          if (signOutError) throw signOutError;
        } catch (signOutError) {
          console.error('Error cerrando la sesión de un login bloqueado:', signOutError);
          try {
            clearStoredAuthSession();
          } catch (clearError) {
            console.error('Error borrando la sesión guardada de un login bloqueado:', clearError);
          }
        }
        throw new Error(message);
      };

      // Traer datos extras del perfil
      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', data.user.id)
        .single();

      // Profiles are created only by handle_new_user at sign-up; the
      // a_guard_profile_privileged_columns trigger rejects any client insert.
      // A missing profile (PGRST116) or a failed read blocks the login: the
      // inactive and cancellation checks below cannot run without it.
      if (profileError || !profileData) {
        if (profileError?.code === 'PGRST116') {
          console.error(`Usuario sin perfil: ${data.user.id}`);
          await rejectLogin("Error en la base de datos: Usuario sin perfil asociado.");
        }
        console.error(`Error leyendo el perfil de ${data.user.id}:`, profileError);
        await rejectLogin("No pudimos verificar tu cuenta. Intentá de nuevo en unos minutos.");
      }

      if (profileData.is_active === false) {
        await rejectLogin("Tu cuenta está inactiva o pendiente de aprobación por administración. Por favor, contactate con soporte.");
      }

      // A cancellation ("Dar de baja") blocks the login once effective, even
      // before the hourly server sweep sets is_active=false (affiliate-cancellation S1).
      // A failed lookup blocks too: the check fails closed (login-block-fail-closed S1).
      if (profileData.role === 'patient') {
        const { data: cancellation, error: cancellationError } = await supabase
          .from('affiliate_cancellations')
          .select('effective_at')
          .eq('profile_id', data.user.id)
          .maybeSingle();
        if (cancellationError) {
          console.error(`Error verificando la baja de ${data.user.id}:`, cancellationError);
          await rejectLogin("No pudimos verificar el estado de tu afiliación. Intentá de nuevo en unos minutos.");
        }
        if (cancellation && new Date(cancellation.effective_at).getTime() <= Date.now()) {
          await rejectLogin("Tu afiliación fue dada de baja. Si querés volver a afiliarte, contactate con administración.");
        }
      }

      let paymentStatus: 'current' | 'overdue' | 'pending' = 'current';
      if (profileData.role === 'patient' && !profileData.agreement_id) {
        const { data: statusRow, error: statusError } = await supabase
          .from('affiliate_payment_status')
          .select('payment_status')
          .eq('entity_id', data.user.id)
          .maybeSingle();

        if (statusError) {
          console.error(`Error obteniendo estado de pago derivado para ${data.user.id}:`, statusError);
        } else if (statusRow) {
          paymentStatus = statusRow.payment_status;
        }
      }

      return {
        id: data.user.id,
        name: profileData.full_name || 'Paciente',
        email: authEmail,
        role: profileData.role as Role,
        avatarUrl: profileData.avatar_url,
        dni: profileData.dni,
        promoter_code: profileData.promoter_code,
        planId: profileData.plan_id ?? undefined,
        planName: profileData.plan_name || 'Sin plan asignado',
        bloodType: profileData.blood_type ?? undefined,
        birthDate: profileData.birth_date ?? undefined,
        credentialHash: profileData.credential_hash,
        phone: profileData.phone,
        address: profileData.address,
        planStatus: profileData.plan_status || 'active',
        paymentStatus,
        currentPeriodQuotaUsed: profileData.current_period_quota_used || 0,
        familyGroupId: profileData.family_group_id ?? undefined,
        digitalPublicKey: profileData.digital_public_key,
        encryptedPrivateKey: profileData.encrypted_private_key,
      } as any;
    } catch (err: any) {
      if (
        import.meta.env.DEV && (
          err?.message?.includes('fetch failed') ||
          err?.message?.includes('Failed to fetch') ||
          err?.code === 'ECONNREFUSED'
        )
      ) {
        return {
          id: 'demo-p1',
          name: 'Carlos Gutiérrez',
          email: authEmail,
          role: role || 'patient',
          dni: '35.123.456',
          phone: '+54 9 11 1234-5678',
          planName: 'Plan Total',
          planStatus: 'active',
          paymentStatus: 'current',
        } as User;
      }
      throw err;
    }
  }

  async resetPasswordFromAdmin(userId: string, newPassword: string): Promise<void> {
    const { data: { session } } = await supabase.auth.getSession();
    const response = await fetch('/api/reset-user-password', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session?.access_token || ''}`,
      },
      body: JSON.stringify({ userId, newPassword }),
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      throw new Error(errData.error || 'Error al restablecer la contraseña en el servidor.');
    }
  }

  /**
   * Actualiza el email de acceso (Supabase Auth) de un usuario. Necesario
   * además de actualizar profiles.email — si no, el usuario queda con un
   * email de login distinto al que ve en su ficha.
   */
  async updateEmailFromAdmin(userId: string, newEmail: string): Promise<void> {
    const { data: { session } } = await supabase.auth.getSession();
    const response = await fetch('/api/update-user-email', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session?.access_token || ''}`,
      },
      body: JSON.stringify({ userId, newEmail }),
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      throw new Error(errData.error || 'Error al actualizar el email en el servidor.');
    }
  }

  async logout(): Promise<void> {
    await supabase.auth.signOut();
  }
}

export const authRepository = new AuthRepository();
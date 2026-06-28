import { supabase } from '../services/supabase';
import { ContactVerification } from '../types';

export class ContactVerificationRepository {
  /**
   * Genera un nuevo desafío OTP para teléfono o correo
   */
  async createChallenge(userId: string, channel: 'phone' | 'email', contactValue: string): Promise<ContactVerification> {
    // Generar OTP aleatorio de 6 dígitos
    const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
    const cleanContact = contactValue.trim();

    const { data, error } = await supabase
      .from('contact_verifications')
      .insert({
        user_id: userId,
        channel,
        contact_value: cleanContact,
        otp_code: otpCode,
        attempts: 0,
        expires_at: new Date(Date.now() + 15 * 60 * 1000).toISOString()
      })
      .select()
      .single();

    if (error) {
      console.error("Error creando desafío OTP:", error);
      throw error;
    }

    // Simulador de envío de mensaje SMS/WhatsApp/Email
    console.log(`[SIMULADOR OTP] Código generado para ${channel} (${cleanContact}): ${otpCode}`);

    return {
      id: data.id,
      userId: data.user_id,
      channel: data.channel,
      contactValue: data.contact_value,
      otpCode: data.otp_code,
      attempts: data.attempts,
      expiresAt: data.expires_at
    };
  }

  /**
   * Valida un código OTP ingresado por el usuario
   */
  async verifyOtp(userId: string, channel: 'phone' | 'email', inputOtp: string): Promise<boolean> {
    const cleanOtp = inputOtp.trim();

    // Buscar el desafío activo más reciente
    const { data: challenges, error } = await supabase
      .from('contact_verifications')
      .select('*')
      .eq('user_id', userId)
      .eq('channel', channel)
      .is('verified_at', null)
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false })
      .limit(1);

    if (error || !challenges || challenges.length === 0) {
      throw new Error("El código de verificación ha expirado o no existe. Solicitá uno nuevo.");
    }

    const challenge = challenges[0];

    if (challenge.attempts >= 5) {
      throw new Error("Superaste el número máximo de intentos. Solicitá un nuevo código.");
    }

    // Verificar coincidencias
    if (challenge.otp_code.trim() === cleanOtp) {
      // 1. Marcar desafío como verificado
      await supabase
        .from('contact_verifications')
        .update({ verified_at: new Date().toISOString() })
        .eq('id', challenge.id);

      // 2. Actualizar bandera en perfil del usuario
      const profileUpdates: Record<string, any> = {};
      if (channel === 'phone') {
        profileUpdates.phone = challenge.contact_value;
        profileUpdates.phone_verified = true;
      } else {
        profileUpdates.real_email = challenge.contact_value;
        profileUpdates.email_verified = true;
      }

      await supabase
        .from('profiles')
        .update(profileUpdates)
        .eq('id', userId);

      return true;
    } else {
      // Incrementar intentos fallidos
      await supabase
        .from('contact_verifications')
        .update({ attempts: challenge.attempts + 1 })
        .eq('id', challenge.id);
      return false;
    }
  }
}

export const contactVerificationRepository = new ContactVerificationRepository();

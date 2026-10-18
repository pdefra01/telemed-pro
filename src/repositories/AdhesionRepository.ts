import { supabase } from '../services/supabase';

export interface AdhesionRequest {
  id?: string;
  titular_name: string;
  titular_first_name?: string;
  titular_last_name?: string;
  titular_dni: string;
  titular_cuil?: string;
  titular_birth_date: string;
  titular_address: string;
  titular_province?: string;
  titular_city?: string;
  titular_locality: string;
  titular_neighborhood: string;
  titular_email: string;
  titular_phone: string;
  titular_civil_status: string;
  titular_health_insurance?: string;
  discovery_source?: string;
  discovery_other?: string;
  preferred_contact_time?: string;
  plan_type?: string;
  payment_method: string;
  payment_detail?: string;
  family_members?: any[];
  medical_history?: string[];
  medical_history_other?: string;
  recommended_friend_phone?: string;
  consent_data_treatment: boolean;
  consent_promotions: boolean;
  signature_base64: string;
  /** Storage paths in the private `adhesion-documents` bucket. */
  titular_dni_front_path?: string | null;
  titular_dni_back_path?: string | null;
  status?: 'pending' | 'approved' | 'rejected';
  promoter_id?: string;
  email_verified?: boolean;
  preferred_billing_day?: number;
  /** Set by the server while an activation holds the row; null = unclaimed. */
  activation_claimed_at?: string | null;
  created_at?: string;
}

/**
 * Outcome of the public auto-activation call (POST /api/adhesion/:id/activate).
 * `failed` covers every non-success answer and network errors: the row stays
 * pending and the admin "Aprobar" button remains the fallback.
 * `pending_review` means an earlier activation got stuck (stale claim): the
 * row waits for an admin to release it.
 */
export type ActivationResult =
  | { status: 'activated'; activationEmailSent: boolean; message?: string }
  | { status: 'already_active'; message?: string }
  | { status: 'processing'; message?: string }
  | { status: 'pending_review'; httpStatus: number; error: string }
  | { status: 'failed'; httpStatus?: number; error: string };

/** Titular's DNI photos, required by the public adhesion form. */
export interface DniPhotos {
  front: Blob;
  back: Blob;
}

export const DNI_PHOTOS_BUCKET = 'adhesion-documents';
export const DNI_PHOTOS_REQUIRED_MESSAGE = 'Cargá las fotos del DNI del titular (frente y dorso).';
export const DNI_PHOTOS_TYPE_MESSAGE = 'Las fotos del DNI deben ser imágenes JPG, PNG o WEBP.';
export const DNI_PHOTOS_UPLOAD_MESSAGE = 'No se pudieron subir las fotos del DNI. Reintentá.';
const DNI_PHOTO_EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

const ACTIVATION_FAILED_MESSAGE = 'No se pudo activar la cuenta automáticamente.';

export class AdhesionRepository {
  /**
   * Envía una solicitud de adhesión de forma pública (para el formulario QR).
   * Returns the created row's id so the caller (AdhesionForm.tsx) can create
   * the débito-automático MP preapproval against it (sdd/mercadopago-integration
   * D-F) — the profile does not exist yet at this point in the flow, so
   * `adhesion_request_id` is the only stable handle available.
   */
  async submitApplication(data: AdhesionRequest, dniPhotos: DniPhotos): Promise<{ id: string }> {
    // Pre-insert duplicate check (DNI + CUIL + titular phone, plus family size by plan) against affiliates, family members
    // and pending requests, for the titular and every family member.
    const checkResponse = await fetch('/api/adhesion/check-duplicates', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        titularDni: data.titular_dni,
        titularCuil: data.titular_cuil,
        titularPhone: data.titular_phone,
        planType: data.plan_type,
        family: (data.family_members || []).map((member: any) => ({
          dni: member.dni,
          cuil: member.cuil,
          name: member.name
        }))
      })
    });

    const checkResult = await checkResponse.json().catch(() => ({}));

    if (!checkResult.ok) {
      const conflictMessages = (checkResult.conflicts || [])
        .filter((conflict: any) => conflict.message)
        .map((conflict: any) => {
          const who = conflict.person === 'titular' ? 'Titular' : `Familiar ${conflict.name || ''}`.trim();
          return `${who}: ${conflict.message}`;
        });
      throw new Error(
        conflictMessages.length > 0
          ? conflictMessages.join(' ')
          : checkResult.error || 'Ya existe una solicitud con datos duplicados.'
      );
    }

    // Validate promoter_id against active producers to prevent orphan records (B-3).
    // Uses a local variable (never mutates the caller's `data`) so that when
    // validation itself errors out, the insert below never persists an
    // unvalidated code — it clears attribution instead of silently keeping it.
    let validatedPromoterId = data.promoter_id && data.promoter_id.trim() !== '' ? data.promoter_id.trim() : null;
    if (validatedPromoterId) {
      const { data: producer, error: producerErr } = await supabase
        .from('producers')
        .select('id')
        .eq('producer_code', validatedPromoterId)
        .eq('status', 'active')
        .maybeSingle();

      if (producerErr) {
        console.warn('Could not validate promoter_id:', producerErr.message);
        // Non-blocking: proceed without promoter attribution if validation fails
        validatedPromoterId = null;
      } else if (!producer) {
        throw new Error('El código de promotor ingresado no es válido o no está activo.');
      }
    }

    // DNI format guard (B-6), mirroring AdhesionForm.tsx's client-side check
    // so a direct API call bypassing the UI can't persist a malformed DNI.
    const titularDni = (data.titular_dni || '').trim();
    if (!/^\d{7,8}$/.test(titularDni)) {
      throw new Error('El DNI debe contener entre 7 y 8 dígitos numéricos sin espacios ni puntos.');
    }

    // DNI photos are mandatory (front and back), checked before any upload so
    // a missing or unsupported file never leaves half the pair in storage.
    if (!dniPhotos?.front || !dniPhotos?.back) {
      throw new Error(DNI_PHOTOS_REQUIRED_MESSAGE);
    }
    if (!DNI_PHOTO_EXTENSIONS[dniPhotos.front.type] || !DNI_PHOTO_EXTENSIONS[dniPhotos.back.type]) {
      throw new Error(DNI_PHOTOS_TYPE_MESSAGE);
    }

    // The id comes from the server, which reserves it together with the photo
    // upload URLs. The anon client has no SELECT policy on adhesion_requests
    // (only "Admins can view adhesion requests" — see
    // supabase/migrations/20260718000000_create_adhesion_requests.sql:38-46),
    // and Postgres RLS applies the SELECT policy to an INSERT's RETURNING
    // clause too, so the insert below never relies on .select()
    // (Judgment Day Round 1 finding). Photos are uploaded before the row
    // exists; the DB trigger checks they are there.
    const { id: generatedId, frontPath, backPath } = await this.uploadDniPhotos(dniPhotos);

    const { error } = await supabase
      .from('adhesion_requests')
      .insert({
        id: generatedId,
        titular_name: data.titular_name,
        titular_first_name: data.titular_first_name || null,
        titular_last_name: data.titular_last_name || null,
        titular_dni: titularDni,
        titular_cuil: data.titular_cuil || null,
        titular_birth_date: data.titular_birth_date,
        titular_address: data.titular_address,
        titular_province: data.titular_province || null,
        titular_city: data.titular_city || null,
        titular_locality: data.titular_locality,
        titular_neighborhood: data.titular_neighborhood,
        titular_email: data.titular_email,
        titular_phone: data.titular_phone,
        titular_civil_status: data.titular_civil_status,
        titular_health_insurance: data.titular_health_insurance || null,
        discovery_source: data.discovery_source || null,
        discovery_other: data.discovery_other || null,
        preferred_contact_time: data.preferred_contact_time || null,
        plan_type: data.plan_type || 'Plan Familiar',
        payment_method: data.payment_method,
        payment_detail: data.payment_detail || null,
        family_members: data.family_members || [],
        medical_history: data.medical_history || [],
        medical_history_other: data.medical_history_other || null,
        recommended_friend_phone: data.recommended_friend_phone || null,
        consent_data_treatment: data.consent_data_treatment,
        consent_promotions: data.consent_promotions,
        signature_base64: data.signature_base64,
        titular_dni_front_path: frontPath,
        titular_dni_back_path: backPath,
        status: 'pending',
        promoter_id: validatedPromoterId,
        email_verified: data.email_verified || false,
        preferred_billing_day: data.preferred_billing_day || 10
      });

    if (error) {
      console.error("Error submitting adhesion request:", error);
      throw new Error(error?.message || "Error al enviar la solicitud.");
    }

    return { id: generatedId };
  }

  /**
   * Reserves the adhesion id server-side and uploads both photos through the
   * one-time signed URLs it returns (the bucket has no anon write policy).
   */
  private async uploadDniPhotos(dniPhotos: DniPhotos): Promise<{ id: string; frontPath: string; backPath: string }> {
    const response = await fetch('/api/adhesion/dni-upload-urls', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        front: DNI_PHOTO_EXTENSIONS[dniPhotos.front.type],
        back: DNI_PHOTO_EXTENSIONS[dniPhotos.back.type],
      }),
    }).catch(() => null);
    const body: any = response ? await response.json().catch(() => ({})) : {};
    if (!response?.ok || !body?.adhesionRequestId || !body?.front?.token || !body?.back?.token) {
      throw new Error(typeof body?.error === 'string' && body.error ? body.error : DNI_PHOTOS_UPLOAD_MESSAGE);
    }

    const bucket = supabase.storage.from(DNI_PHOTOS_BUCKET);
    const results = await Promise.all([
      bucket.uploadToSignedUrl(body.front.path, body.front.token, dniPhotos.front, { contentType: dniPhotos.front.type }),
      bucket.uploadToSignedUrl(body.back.path, body.back.token, dniPhotos.back, { contentType: dniPhotos.back.type }),
    ]);
    const failed = results.find((result) => result.error);
    if (failed) {
      console.error('Error uploading DNI photos:', failed.error);
      throw new Error(DNI_PHOTOS_UPLOAD_MESSAGE);
    }
    return { id: body.adhesionRequestId, frontPath: body.front.path, backPath: body.back.path };
  }

  /**
   * Short-lived signed URLs for the titular's DNI photos (admins only, the
   * bucket is private). A side without a stored path comes back as null.
   */
  async getDniPhotoUrls(request: Pick<AdhesionRequest, 'titular_dni_front_path' | 'titular_dni_back_path'>): Promise<{ front: string | null; back: string | null }> {
    const sign = async (path?: string | null): Promise<string | null> => {
      if (!path) return null;
      const { data, error } = await supabase.storage.from(DNI_PHOTOS_BUCKET).createSignedUrl(path, 600);
      if (error || !data?.signedUrl) {
        console.error('Error signing DNI photo URL:', error);
        return null;
      }
      return data.signedUrl;
    };
    const [front, back] = await Promise.all([
      sign(request.titular_dni_front_path),
      sign(request.titular_dni_back_path),
    ]);
    return { front, back };
  }

  /**
   * Activates a just-submitted adhesion (public endpoint, no session: the
   * server checks the OTP-verified email and re-runs duplicate checks).
   * Never throws: the payment step must not depend on activation.
   */
  async activateApplication(id: string): Promise<ActivationResult> {
    let response: Response;
    try {
      response = await fetch(`/api/adhesion/${encodeURIComponent(id)}/activate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
    } catch (err) {
      console.warn('[AdhesionRepository] activateApplication network error:', err);
      return { status: 'failed', error: ACTIVATION_FAILED_MESSAGE };
    }

    const body: any = await response.json().catch(() => ({}));
    const message = typeof body?.message === 'string' ? body.message : undefined;

    if (response.status === 202 && body?.processing) {
      return { status: 'processing', message };
    }
    if (response.ok && body?.activated) {
      return { status: 'activated', activationEmailSent: body.activationEmailSent !== false, message };
    }
    if (response.ok && body?.alreadyActive) {
      return { status: 'already_active', message };
    }

    const error = typeof body?.error === 'string' && body.error ? body.error : ACTIVATION_FAILED_MESSAGE;
    if (response.status === 409 && body?.pendingReview === true) {
      return { status: 'pending_review', httpStatus: response.status, error };
    }
    return { status: 'failed', httpStatus: response.status, error };
  }

  /**
   * Obtiene todas las solicitudes pendientes (exclusivo para Admins)
   */
  async getPendingApplications(): Promise<AdhesionRequest[]> {
    const { data, error } = await supabase
      .from('adhesion_requests')
      .select('*')
      .eq('status', 'pending')
      .order('created_at', { ascending: false });

    if (error) {
      console.error("Error fetching pending applications:", error);
      throw new Error(error.message || "Error al obtener solicitudes pendientes.");
    }

    return data || [];
  }

  /**
   * Aprueba una solicitud llamando al endpoint del backend. El endpoint
   * ahora requiere sesión de admin (D7) — se envía el access_token de la
   * sesión actual, mirroring `AuthRepository.resetPasswordFromAdmin`.
   *
   * @returns `activationEmailSent` — false means the affiliate's account was
   * created but the activation email failed to send (Judgment Day finding:
   * without surfacing this, the affiliate would be left with a passwordless
   * account and no visible signal to any admin). Callers should warn the
   * admin so they know to use the manual reset-password tool instead.
   */
  async approveApplication(id: string): Promise<{ activationEmailSent: boolean }> {
    const { data: { session } } = await supabase.auth.getSession();
    const response = await fetch('/api/approve-adhesion', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session?.access_token || ''}`,
      },
      body: JSON.stringify({ adhesionId: id }),
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      throw new Error(errData.error || 'Error al aprobar la afiliación en el servidor.');
    }

    const result = await response.json().catch(() => ({}));
    return { activationEmailSent: result?.activationEmailSent !== false };
  }

  /**
   * Corrige el email del titular de una solicitud pendiente (solo admin).
   * Devuelve el email normalizado que guardó el servidor.
   */
  async updateApplicationEmail(id: string, email: string): Promise<string> {
    const { data: { session } } = await supabase.auth.getSession();
    const response = await fetch(`/api/adhesion-requests/${encodeURIComponent(id)}/email`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session?.access_token || ''}`,
      },
      body: JSON.stringify({ email }),
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      throw new Error(errData.error || 'Error al actualizar el email de la solicitud.');
    }

    const result = await response.json().catch(() => ({}));
    return result?.email || email;
  }

  /**
   * Libera una activación trabada (solo admin): el servidor borra la cuenta de
   * acceso incompleta (si es segura de borrar) y limpia el claim, dejando la
   * solicitud pendiente para "Aprobar". Lanza con el mensaje del servidor si
   * lo rechaza (claim todavía fresco, cuenta no borrable, fila modificada).
   */
  async releaseStuckActivation(id: string): Promise<{ deletedUserId: string | null }> {
    const { data: { session } } = await supabase.auth.getSession();
    const response = await fetch(`/api/adhesion-requests/${encodeURIComponent(id)}/release-activation`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session?.access_token || ''}`,
      },
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      throw new Error(errData.error || 'Error al liberar la activación.');
    }

    const result = await response.json().catch(() => ({}));
    return { deletedUserId: typeof result?.deletedUserId === 'string' ? result.deletedUserId : null };
  }

  /**
   * Reenvía el mail de activación a un afiliado ya aprobado (solo admin).
   * Lanza con el mensaje del servidor si falla (cooldown, SMTP, email placeholder).
   */
  async resendActivationEmail(profileId: string): Promise<void> {
    const { data: { session } } = await supabase.auth.getSession();
    const response = await fetch('/api/resend-activation', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session?.access_token || ''}`,
      },
      body: JSON.stringify({ profileId }),
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      throw new Error(errData.error || 'Error al reenviar el mail de activación.');
    }
  }

  /**
   * Rechaza una solicitud de adhesión cambiándole el estado
   */
  async rejectApplication(id: string): Promise<void> {
    const { error } = await supabase
      .from('adhesion_requests')
      .update({ status: 'rejected' })
      .eq('id', id);

    if (error) {
      console.error(`Error rejecting application ${id}:`, error);
      throw new Error(error.message || "Error al rechazar la solicitud.");
    }
  }
}

export const adhesionRepository = new AdhesionRepository();

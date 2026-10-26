import { supabase } from '../services/supabase';
import { MedicalDocument } from '../types';

const BUCKET = 'medical-documents';
const SIGNED_URL_TTL_SECONDS = 60 * 60;

export class MedicalDocumentRepository {
  /**
   * Sube un archivo a Supabase Storage y registra la meta-información en la DB.
   */
  async uploadDocument(
    patientId: string,
    file: File,
    title: string,
    type: MedicalDocument['type'],
    familyMemberId?: string
  ): Promise<MedicalDocument> {
    // 1. Definir el path: patientId/timestamp_filename
    const fileExt = file.name.split('.').pop();
    const fileName = `${Math.random().toString(36).substring(2)}_${Date.now()}.${fileExt}`;
    const filePath = `${patientId}/${fileName}`;

    // 2. Subir al bucket 'medical-documents'
    const { error: uploadError } = await supabase.storage
      .from('medical-documents')
      .upload(filePath, file);

    if (uploadError) {
      console.error('Error uploading to storage:', uploadError);
      throw new Error(`Error al subir archivo: ${uploadError.message}`);
    }

    // 3. Obtener la URL (usamos URL firmada o pública dependiendo de la config)
    const { data: { publicUrl } } = supabase.storage
      .from('medical-documents')
      .getPublicUrl(filePath);

    // 4. Registrar en la tabla medical_documents
    const { data, error: dbError } = await supabase
      .from('medical_documents')
      .insert([{
        patient_id: patientId,
        title,
        type,
        url: publicUrl,
        uploaded_by: 'patient',
        family_member_id: familyMemberId || null
      }])
      .select()
      .single();

    if (dbError) {
      // Si falla la DB, borramos el archivo del storage (cleanup)
      await supabase.storage.from('medical-documents').remove([filePath]);
      console.error('Error saving to database:', dbError);
      throw new Error(`Error al registrar documento: ${dbError.message}`);
    }

    return {
      id: data.id,
      patientId: data.patient_id,
      familyMemberId: data.family_member_id || undefined,
      title: data.title,
      type: data.type,
      date: data.date,
      url: data.url,
      uploadedBy: data.uploaded_by as 'patient' | 'doctor'
    };
  }

  async getDocumentsByPatientId(patientId: string): Promise<MedicalDocument[]> {
    const { data, error } = await supabase
      .from('medical_documents')
      .select('*')
      .eq('patient_id', patientId)
      .order('date', { ascending: false });

    if (error) throw error;

    const signedUrls = await this.signUrls(data.map((item: any) => item.url));

    return data.map((item: any, index: number) => ({
      id: item.id,
      patientId: item.patient_id,
      familyMemberId: item.family_member_id || undefined,
      title: item.title,
      type: item.type,
      date: item.date,
      url: signedUrls[index],
      uploadedBy: item.uploaded_by
    }));
  }

  /**
   * The bucket is private, but rows store the `/object/public/` URL that
   * getPublicUrl() returned at upload time, which answers "Bucket not found".
   * Derive the object path from the stored URL and sign it; fall back to the
   * stored URL when it cannot be signed.
   */
  private async signUrls(storedUrls: string[]): Promise<string[]> {
    const marker = `/${BUCKET}/`;
    const paths = storedUrls.map((url) => {
      const at = url.indexOf(marker);
      return at === -1 ? null : decodeURIComponent(url.slice(at + marker.length).split('?')[0]);
    });

    const toSign = paths.filter((p): p is string => p !== null);
    if (toSign.length === 0) return storedUrls;

    const { data, error } = await supabase.storage.from(BUCKET).createSignedUrls(toSign, SIGNED_URL_TTL_SECONDS);
    if (error || !data) {
      console.error('Error signing medical document URLs:', error);
      return storedUrls;
    }

    const signedByPath = new Map<string, string>();
    data.forEach((entry) => {
      if (entry.path && entry.signedUrl) signedByPath.set(entry.path, entry.signedUrl);
    });

    return storedUrls.map((url, index) => {
      const path = paths[index];
      return (path && signedByPath.get(path)) || url;
    });
  }
}

export const medicalDocumentRepository = new MedicalDocumentRepository();

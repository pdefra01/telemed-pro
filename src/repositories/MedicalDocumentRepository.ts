import { supabase } from '../services/supabase';
import { MedicalDocument } from '../types';

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

    return data.map((item: any) => ({
      id: item.id,
      patientId: item.patient_id,
      familyMemberId: item.family_member_id || undefined,
      title: item.title,
      type: item.type,
      date: item.date,
      url: item.url,
      uploadedBy: item.uploaded_by
    }));
  }
}

export const medicalDocumentRepository = new MedicalDocumentRepository();

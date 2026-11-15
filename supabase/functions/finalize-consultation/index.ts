import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { formatDoctorName } from '../_shared/doctorName.ts'
import { buildPrescriptionPdf, uploadPrescriptionPdf } from '../_shared/prescriptionPdf.ts'

// pharmacy_products ids are UUIDs; anything else is dropped instead of stored.
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    const supabase = createClient(supabaseUrl, supabaseKey)

    const body = await req.json()
    const { appointmentId, diagnosis, notes, prescription, indications, externalPrescriptionUrl } = body

    // Obra social mode: an insurer-issued prescription link replaces the internal PDF.
    let externalUrl: string | null = null
    if (externalPrescriptionUrl !== undefined && externalPrescriptionUrl !== null && externalPrescriptionUrl !== '') {
      const candidate = typeof externalPrescriptionUrl === 'string' ? externalPrescriptionUrl.trim() : ''
      let isHttps = false
      try { isHttps = new URL(candidate).protocol === 'https:' } catch { /* invalid URL */ }
      if (!isHttps || candidate.length > 2000 || /\s/.test(candidate)) {
        return new Response(
          JSON.stringify({ error: 'El link de la receta de obra social debe ser una URL https válida (máximo 2000 caracteres)' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
        )
      }
      externalUrl = candidate
    }
    const medications = externalUrl ? [] : (body.medications || prescription?.medications || []);

    // 1. Get Appointment Info
    const { data: appointment, error: apptError } = await supabase
      .from('appointments')
      .select('*, patient:profiles!patient_id(full_name, dni, phone, email), family_member:family_members!family_member_id(full_name, dni)')
      .eq('id', appointmentId)
      .single()

    if (apptError || !appointment) {
      throw new Error('Turno no encontrado')
    }

    // The person attended: a family member when the appointment has one, else the
    // titular. Their clinical record and receta are stored and printed under them.
    const attended = appointment.family_member ?? appointment.patient

    // 2. Get Doctor Info (for the records). '*' instead of a column list so the
    // function keeps working on a database without professional_title yet.
    const { data: doctor, error: docError } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', appointment.doctor_id)
      .single()

    if (docError) throw docError

    const doctorDisplayName = formatDoctorName(doctor.professional_title, doctor.full_name)
    const isFemaleTitle = doctorDisplayName.startsWith('Dra.')

    // 3. Create Medical Record
    const { error: recordError } = await supabase
      .from('medical_records')
      .insert({
        appointment_id: appointmentId,
        patient_id: appointment.patient_id,
        family_member_id: appointment.family_member_id ?? null,
        doctor_id: appointment.doctor_id,
        doctor_name: doctor.full_name,
        diagnosis,
        notes,
        type: 'consultation'
      })

    if (recordError) throw recordError

    let pdfUrl = null;
    let pdfPath: string | null = null;
    const trimmedIndications = typeof indications === 'string' ? indications.trim() : '';

    if (medications.length > 0) {
      // 4a. Generar PDF (shared with issue-prescription)
      const pdfBytes = await buildPrescriptionPdf({
        attended,
        doctorDisplayName,
        doctor,
        medications,
        diagnosis: diagnosis ?? '',
      })

      // 4b/4c. Subir al bucket privado y firmar la URL (con robustez para local dev si el storage está apagado)
      try {
        const uploaded = await uploadPrescriptionPdf(supabase, `${appointment.patient_id}/${appointmentId}-${Date.now()}.pdf`, pdfBytes)
        pdfUrl = uploaded.pdfUrl
        pdfPath = uploaded.pdfPath
      } catch (storageErr) {
        console.warn("⚠️ [Local Dev] El servicio de Storage no está activo o falló al subir. Usando fallback de URL mockeada:", storageErr.message);
        pdfUrl = "https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf";
        pdfPath = null;
      }
    }

    // 4d. Guardar en DB: hay receta (medicamentos) y/o prescripción (indicaciones)
    if (medications.length > 0 || trimmedIndications || externalUrl) {
      const { error: prescError } = await supabase
        .from('prescriptions')
        .insert({
          appointment_id: appointmentId,
          patient_id: appointment.patient_id,
          family_member_id: appointment.family_member_id ?? null,
          doctor_id: appointment.doctor_id,
          doctor_name: doctor.full_name,
          expiration_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
          // NOT NULL column: prescriptions are no longer signed
          digital_signature: '',
          medications: medications.map((m: any) => ({
            name: m.name,
            instructions: m.instructions,
            quantity: 1,
            // Catalog product the doctor picked: dispensing uses it instead of
            // matching by name (issue #35). Absent for free-text medications.
            ...(typeof m.productId === 'string' && UUID_PATTERN.test(m.productId) ? { productId: m.productId } : {})
          })),
          notes: trimmedIndications || null,
          pdf_url: pdfUrl,
          pdf_path: pdfPath,
          // Only set in obra social mode so other flows never depend on the new column
          ...(externalUrl ? { external_prescription_url: externalUrl } : {})
        })

      if (prescError) throw prescError
    }

    // 4e. Mock WhatsApp API - Envío de receta y recomendaciones estructuradas (siempre se envía al finalizar)
    const patientPhone = appointment.patient.phone || "No especificado";
    let messageBody = `¡Hola ${appointment.patient.full_name}! Tu consulta con ${isFemaleTitle ? 'la' : 'el'} ${doctorDisplayName} ha finalizado.\n\n` +
      `📝 Diagnóstico: ${diagnosis}\n` +
      `📌 Indicaciones: ${notes || 'Sin indicaciones adicionales.'}\n\n`;
    
    if (medications.length > 0) {
      messageBody += `💊 Receta Digital:\n` + medications.map((m: any) => `- ${m.name}: ${m.instructions}`).join('\n') + `\n\n` +
        `📄 Podés descargar tu receta aquí: ${pdfUrl}`;
    } else {
      messageBody += `No se recetaron medicamentos en esta consulta.`;
    }

    console.log(`[SIMULADOR WHATSAPP OUTBOUND] Enviando mensaje a ${patientPhone}:\n========================================\n${messageBody}\n========================================`);

    // 5. Update Appointment Status to COMPLETED
    const { error: updateError } = await supabase
      .from('appointments')
      .update({ status: 'completed' })
      .eq('id', appointmentId)

    if (updateError) throw updateError

    // 6. Send Real-time Notification to Patient
    const notificationPayload = {
      user_id: appointment.patient_id,
      title: "Consulta Finalizada",
      message: `${isFemaleTitle ? 'La' : 'El'} ${doctorDisplayName} ha finalizado tu consulta. Ya podés revisar tu receta y resumen médico.`,
      type: "success",
      link: pdfUrl || "/dashboard/medical-records"
    }

    const { error: notifError } = await supabase
      .from('notifications')
      .insert(notificationPayload)

    if (notifError) {
      console.error("Error enviando notificación:", notifError)
      // No lanzamos error para no romper el flujo principal si solo falla la notificación
    }

    return new Response(
      JSON.stringify({ 
        message: 'Consulta finalizada con éxito',
        pdfUrl: pdfUrl 
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    )

  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
    )
  }
})

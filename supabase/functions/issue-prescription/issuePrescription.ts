// Core of the issue-prescription edge function: a doctor issues a receta to any
// affiliate (titular or family group member) without a video consultation.
// Pure apart from injected deps, so it runs under Vitest; index.ts wires Deno.
import { formatDoctorName } from '../_shared/doctorName.ts'

export interface PrescriptionPdfRequest {
  attended: { full_name: string | null; dni?: string | null }
  doctorDisplayName: string
  doctor: { license_number?: string | null; specialty?: string | null }
  medications: { name: string; instructions: string }[]
}

export interface IssuePrescriptionDeps {
  // Service-role client: every authorization check below happens here, not in RLS.
  // deno-lint-ignore no-explicit-any
  supabase: any
  buildPdf: (input: PrescriptionPdfRequest) => Promise<Uint8Array>
  // deno-lint-ignore no-explicit-any
  uploadPdf: (supabase: any, fileName: string, bytes: Uint8Array) => Promise<{ pdfUrl: string; pdfPath: string }>
  now?: () => number
}

export interface IssuePrescriptionResult {
  status: number
  body: Record<string, unknown>
}

// pharmacy_products ids and row ids are UUIDs; anything else is dropped or rejected.
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000

const fail = (status: number, error: string): IssuePrescriptionResult => ({ status, body: { error } })

interface ParsedInput {
  patientId: string
  familyMemberId: string | null
  medications: { name: string; instructions: string; productId?: string }[]
  indications: string
  externalUrl: string | null
}

// deno-lint-ignore no-explicit-any
function parseInput(body: any): ParsedInput | IssuePrescriptionResult {
  const patientId = typeof body?.patientId === 'string' ? body.patientId : ''
  if (!UUID_PATTERN.test(patientId)) return fail(400, 'Falta el paciente de la receta.')

  const rawMember = body?.familyMemberId
  let familyMemberId: string | null = null
  if (rawMember !== undefined && rawMember !== null && rawMember !== '') {
    if (typeof rawMember !== 'string' || !UUID_PATTERN.test(rawMember)) {
      return fail(400, 'El integrante no pertenece al grupo familiar del paciente.')
    }
    familyMemberId = rawMember
  }

  // Obra social mode: an insurer-issued prescription link replaces medications and PDF.
  let externalUrl: string | null = null
  const rawUrl = body?.externalPrescriptionUrl
  if (rawUrl !== undefined && rawUrl !== null && rawUrl !== '') {
    const candidate = typeof rawUrl === 'string' ? rawUrl.trim() : ''
    let isHttps = false
    try { isHttps = new URL(candidate).protocol === 'https:' } catch { /* invalid URL */ }
    if (!isHttps || candidate.length > 2000 || /\s/.test(candidate)) {
      return fail(400, 'El link de la receta de obra social debe ser una URL https válida (máximo 2000 caracteres)')
    }
    externalUrl = candidate
  }

  const rawMeds = externalUrl || !Array.isArray(body?.medications) ? [] : body.medications
  const medications: ParsedInput['medications'] = []
  for (const m of rawMeds) {
    const name = typeof m?.name === 'string' ? m.name.trim() : ''
    if (!name) return fail(400, 'Cada medicamento necesita un nombre.')
    const instructions = typeof m?.instructions === 'string' ? m.instructions.trim() : ''
    medications.push({
      name,
      instructions,
      ...(typeof m?.productId === 'string' && UUID_PATTERN.test(m.productId) ? { productId: m.productId } : {}),
    })
  }

  const indications = typeof body?.indications === 'string' ? body.indications.trim() : ''
  if (medications.length === 0 && !indications && !externalUrl) {
    return fail(400, 'La receta necesita al menos un medicamento, indicaciones o el link de obra social.')
  }

  return { patientId, familyMemberId, medications, indications, externalUrl }
}

export async function issuePrescription(
  deps: IssuePrescriptionDeps,
  // deno-lint-ignore no-explicit-any
  request: { token: string | null; body: any },
): Promise<IssuePrescriptionResult> {
  const { supabase } = deps
  const now = deps.now ?? Date.now

  // 1. Caller must be a signed-in doctor. The receta's doctor is always the
  // caller; any doctor id in the body is ignored.
  if (!request.token) return fail(401, 'Sesión requerida.')
  const { data: authData, error: authError } = await supabase.auth.getUser(request.token)
  const callerId = authData?.user?.id
  if (authError || !callerId) return fail(401, 'Sesión inválida o vencida.')

  // '*' so the function keeps working on a database without professional_title.
  const { data: doctor } = await supabase.from('profiles').select('*').eq('id', callerId).maybeSingle()
  if (!doctor || doctor.role !== 'doctor') return fail(403, 'Solo un médico puede emitir recetas.')

  // 2. Input
  const parsed = parseInput(request.body)
  if ('status' in parsed) return parsed
  const { patientId, familyMemberId, medications, indications, externalUrl } = parsed

  // 3. Patient and, optionally, the family member attended. Checked here (same
  // rule as the DB trigger) so a wrong member never leaves an orphan PDF.
  const { data: patient } = await supabase.from('profiles').select('*').eq('id', patientId).maybeSingle()
  if (!patient) return fail(404, 'Paciente no encontrado.')

  let attended: { full_name: string | null; dni?: string | null } = { full_name: patient.full_name, dni: patient.dni }
  if (familyMemberId) {
    const { data: member } = await supabase
      .from('family_members')
      .select('id, full_name, dni, family_group_id')
      .eq('id', familyMemberId)
      .maybeSingle()
    if (!member || !patient.family_group_id || member.family_group_id !== patient.family_group_id) {
      return fail(400, 'El integrante no pertenece al grupo familiar del paciente.')
    }
    attended = { full_name: member.full_name, dni: member.dni }
  }

  const doctorDisplayName = formatDoctorName(doctor.professional_title, doctor.full_name)

  // 4. PDF only when there are medications. No dummy-URL fallback here: a
  // receta without its PDF is not issued.
  let pdfUrl: string | null = null
  let pdfPath: string | null = null
  if (medications.length > 0) {
    try {
      const bytes = await deps.buildPdf({
        attended,
        doctorDisplayName,
        doctor: { license_number: doctor.license_number, specialty: doctor.specialty },
        medications: medications.map((m) => ({ name: m.name, instructions: m.instructions })),
      })
      const uploaded = await deps.uploadPdf(supabase, `${patientId}/standalone-${now()}.pdf`, bytes)
      pdfUrl = uploaded.pdfUrl
      pdfPath = uploaded.pdfPath
    } catch (err) {
      console.error('[issue-prescription] PDF failed:', err instanceof Error ? err.message : err)
      return fail(500, 'No se pudo guardar el PDF de la receta. Intentá de nuevo.')
    }
  }

  // 5. The receta itself. No appointment, no medical record: it is not a consultation.
  const { data: inserted, error: insertError } = await supabase
    .from('prescriptions')
    .insert({
      appointment_id: null,
      patient_id: patientId,
      family_member_id: familyMemberId,
      doctor_id: callerId,
      doctor_name: doctor.full_name,
      expiration_date: new Date(now() + THIRTY_DAYS_MS).toISOString(),
      // NOT NULL column: prescriptions are no longer signed
      digital_signature: '',
      medications: medications.map((m) => ({ ...m, quantity: 1 })),
      notes: indications || null,
      pdf_url: pdfUrl,
      pdf_path: pdfPath,
      ...(externalUrl ? { external_prescription_url: externalUrl } : {}),
    })
    .select('id')
    .single()

  if (insertError || !inserted) {
    console.error('[issue-prescription] insert failed:', insertError?.message)
    return fail(500, 'No se pudo guardar la receta. Intentá de nuevo.')
  }

  // 6. In-app notice; a failure here never undoes the receta.
  const article = doctorDisplayName.startsWith('Dra.') ? 'La' : 'El'
  const { error: notifError } = await supabase.from('notifications').insert({
    user_id: patientId,
    title: 'Nueva receta',
    message: `${article} ${doctorDisplayName} te envió una receta. Ya podés verla en tu historial.`,
    type: 'success',
    link: '/dashboard/medical-records',
  })
  if (notifError) console.error('[issue-prescription] notification failed:', notifError.message)

  return { status: 201, body: { prescriptionId: inserted.id, pdfUrl } }
}

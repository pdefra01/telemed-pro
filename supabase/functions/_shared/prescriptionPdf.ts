import { PDFDocument, rgb, StandardFonts } from 'https://esm.sh/pdf-lib@1.17.1'

// Prescription PDF shared by finalize-consultation (after a video consultation)
// and issue-prescription (receta issued without a consultation).

export interface PrescriptionPdfInput {
  attended: { full_name: string | null; dni?: string | null }
  doctorDisplayName: string
  doctor: { license_number?: string | null; specialty?: string | null }
  medications: { name: string; instructions: string }[]
  // Printed as a subtle "Dx:" line; only a consultation has one.
  diagnosis?: string
}

export async function buildPrescriptionPdf(input: PrescriptionPdfInput): Promise<Uint8Array> {
  const { attended, doctorDisplayName, doctor, medications, diagnosis } = input

  const pdfDoc = await PDFDocument.create()
  const helveticaFont = await pdfDoc.embedFont(StandardFonts.Helvetica)
  const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold)

  const page = pdfDoc.addPage([595.28, 841.89]) // A4
  const { width, height } = page.getSize()

  // Colores
  const primaryColor = rgb(0.05, 0.45, 0.65) // Teal/Blue profesional
  const textColor = rgb(0.1, 0.1, 0.1)
  const lightGray = rgb(0.95, 0.95, 0.95)

  // Header background decoration
  page.drawRectangle({
    x: 0,
    y: height - 100,
    width: width,
    height: 100,
    color: primaryColor,
  })

  // Logo/Brand text
  page.drawText('MEDINEX', { x: 40, y: height - 50, size: 24, font: helveticaBold, color: rgb(1, 1, 1) })
  page.drawText('RECETA ELECTRÓNICA OFICIAL', { x: 40, y: height - 75, size: 10, font: helveticaBold, color: rgb(1, 1, 1) })

  // Info box background
  page.drawRectangle({
    x: 40,
    y: height - 220,
    width: width - 80,
    height: 100,
    color: lightGray,
    borderColor: rgb(0.9, 0.9, 0.9),
    borderWidth: 1,
  })

  // Paciente & Doctor Info
  let currentY = height - 140
  page.drawText('DATOS DEL PACIENTE', { x: 50, y: currentY, size: 8, font: helveticaBold, color: primaryColor })
  currentY -= 15
  page.drawText(`Nombre: ${attended.full_name}`, { x: 50, y: currentY, size: 11, font: helveticaFont, color: textColor })
  page.drawText(`DNI: ${attended.dni || 'N/A'}`, { x: 300, y: currentY, size: 11, font: helveticaFont, color: textColor })

  currentY -= 30
  page.drawText('DATOS DEL PROFESIONAL', { x: 50, y: currentY, size: 8, font: helveticaBold, color: primaryColor })
  currentY -= 15
  page.drawText(`Nombre: ${doctorDisplayName}`, { x: 50, y: currentY, size: 11, font: helveticaFont, color: textColor })
  page.drawText(`Matrícula: ${doctor.license_number || 'En trámite'}`, { x: 300, y: currentY, size: 11, font: helveticaFont, color: textColor })
  page.drawText(`Especialidad: ${doctor.specialty || 'Clínica Médica'}`, { x: 50, y: currentY - 15, size: 10, font: helveticaFont, color: rgb(0.4, 0.4, 0.4) })

  // Prescription content
  currentY = height - 260
  page.drawText('INDICACIONES FARMACOLÓGICAS', { x: 40, y: currentY, size: 12, font: helveticaBold, color: primaryColor })
  page.drawLine({
    start: { x: 40, y: currentY - 8 },
    end: { x: width - 40, y: currentY - 8 },
    thickness: 1.5,
    color: primaryColor,
    opacity: 0.3
  })

  currentY -= 40

  // Loop medications
  for (const med of medications) {
    // Bullet point
    page.drawCircle({ x: 50, y: currentY + 4, size: 3, color: primaryColor })

    page.drawText(med.name, { x: 65, y: currentY, size: 12, font: helveticaBold, color: textColor })
    currentY -= 18
    page.drawText(med.instructions, { x: 65, y: currentY, size: 10, font: helveticaFont, color: rgb(0.3, 0.3, 0.3) })

    currentY -= 35 // Spacing between meds
  }

  // Diagnosis (subtle)
  if (diagnosis !== undefined) {
    currentY -= 20
    page.drawText(`Dx: ${diagnosis}`, { x: 40, y: currentY, size: 9, font: helveticaFont, color: rgb(0.5, 0.5, 0.5) })
  }

  return await pdfDoc.save()
}

// Uploads to the private prescriptions_pdfs bucket and signs a 48h URL. The
// WhatsApp "Reenviar" re-signs pdf_path at send time, so nothing depends on this
// URL surviving. Throws when storage fails; each caller decides the fallback.
// deno-lint-ignore no-explicit-any
export async function uploadPrescriptionPdf(supabase: any, fileName: string, pdfBytes: Uint8Array): Promise<{ pdfUrl: string; pdfPath: string }> {
  const { error: uploadError } = await supabase.storage
    .from('prescriptions_pdfs')
    .upload(fileName, pdfBytes, {
      contentType: 'application/pdf',
      cacheControl: '3600',
      upsert: false
    })

  if (uploadError) throw uploadError

  const { data: signedUrlData, error: signError } = await supabase.storage
    .from('prescriptions_pdfs')
    .createSignedUrl(fileName, 60 * 60 * 48)

  if (signError) throw signError

  return { pdfUrl: signedUrlData.signedUrl, pdfPath: fileName }
}

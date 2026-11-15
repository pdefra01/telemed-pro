import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { buildPrescriptionPdf, uploadPrescriptionPdf } from '../_shared/prescriptionPdf.ts'
import { issuePrescription } from './issuePrescription.ts'

// A doctor issues a receta to any affiliate without a video consultation.
// All rules live in issuePrescription.ts (tested with Vitest).

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const json = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status })

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    )

    const authHeader = req.headers.get('Authorization') ?? ''
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice('Bearer '.length).trim() : null

    let body: unknown
    try {
      body = await req.json()
    } catch {
      return json(400, { error: 'Solicitud inválida.' })
    }

    const result = await issuePrescription(
      { supabase, buildPdf: buildPrescriptionPdf, uploadPdf: uploadPrescriptionPdf },
      { token, body },
    )
    return json(result.status, result.body)
  } catch (error) {
    console.error('[issue-prescription] unexpected error:', error)
    return json(500, { error: 'No se pudo emitir la receta. Intentá de nuevo.' })
  }
})

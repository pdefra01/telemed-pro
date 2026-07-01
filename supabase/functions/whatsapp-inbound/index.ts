import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const url = new URL(req.url)

  // ── 1. VERIFICACIÓN DEL WEBHOOK DE META (GET) ──────────────────────────────
  // Meta envía un GET a esta URL para validar el webhook usando un token de verificación definido por nosotros.
  if (req.method === 'GET') {
    const hubMode = url.searchParams.get('hub.mode')
    const hubChallenge = url.searchParams.get('hub.challenge')
    const hubVerifyToken = url.searchParams.get('hub.verify_token')

    // Definimos un token de verificación (por defecto 'medinex-verify-token')
    const VERIFY_TOKEN = Deno.env.get('WHATSAPP_VERIFY_TOKEN') || 'medinex-verify-token'

    if (hubMode === 'subscribe' && hubVerifyToken === VERIFY_TOKEN) {
      console.log('✅ Webhook verificado correctamente con Meta.')
      return new Response(hubChallenge, { status: 200 })
    }
    console.error('❌ Fallo en la verificación del token de Meta.')
    return new Response('Forbidden', { status: 403 })
  }

  // ── 2. PROCESAMIENTO DE MENSAJES Y SIMULACIÓN (POST) ───────────────────────
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    const supabase = createClient(supabaseUrl, supabaseKey)

    const body = await req.json()

    // --- MODO SIMULACIÓN LOCAL ---
    // Si viene 'simulate: true', simulamos el flujo completo de recepción del archivo sin pegarle a la API de Meta.
    if (body.simulate) {
      const { phone, fileUrl, fileName, title, type, familyMemberName } = body

      if (!phone || !fileUrl) {
        throw new Error('Parámetros insuficientes para la simulación (se requiere phone y fileUrl)')
      }

      console.log(`[SIMULATION] Buscando paciente con celular: ${phone}`)
      const { data: profile, error: profileErr } = await supabase
        .from('profiles')
        .select('id, full_name, family_group_id')
        .eq('phone', phone)
        .single()

      if (profileErr || !profile) {
        throw new Error(`No se encontró paciente con celular ${phone} en la base de datos.`)
      }

      let familyMemberId = null
      if (familyMemberName && profile.family_group_id) {
        const { data: member } = await supabase
          .from('family_members')
          .select('id, full_name')
          .eq('family_group_id', profile.family_group_id)
          .ilike('full_name', `%${familyMemberName}%`)
          .limit(1)
          .maybeSingle()

        if (member) {
          familyMemberId = member.id
          console.log(`[SIMULATION] Asignando estudio al familiar: ${member.full_name} (${member.id})`)
        }
      }

      // Descargamos el archivo simulado y lo subimos a nuestro bucket
      console.log(`[SIMULATION] Descargando archivo desde: ${fileUrl}`)
      const fileRes = await fetch(fileUrl)
      if (!fileRes.ok) throw new Error('Error al descargar el archivo de la URL de simulación')
      const blob = await fileRes.blob()

      const fileExt = fileName ? fileName.split('.').pop() : 'pdf'
      const finalFileName = `whatsapp_sim_${Date.now()}.${fileExt}`
      const filePath = `${profile.id}/${finalFileName}`

      console.log(`[SIMULATION] Subiendo archivo a storage: ${filePath}`)
      const { error: uploadError } = await supabase.storage
        .from('medical-documents')
        .upload(filePath, blob, { contentType: blob.type })

      if (uploadError) throw uploadError

      const { data: { publicUrl } } = supabase.storage
        .from('medical-documents')
        .getPublicUrl(filePath)

      // Guardamos en la base de datos
      const { data: document, error: dbError } = await supabase
        .from('medical_documents')
        .insert([{
          patient_id: profile.id,
          family_member_id: familyMemberId,
          title: title || 'Estudio recibido por WhatsApp',
          type: type || 'other',
          url: publicUrl,
          uploaded_by: 'patient'
        }])
        .select()
        .single()

      if (dbError) throw dbError

      // Enviamos notificación en tiempo real al paciente
      await supabase.from('notifications').insert({
        user_id: profile.id,
        title: "Estudio cargado vía WhatsApp",
        message: `Se ha cargado un nuevo documento ${familyMemberName ? `para ${familyMemberName}` : 'a tu cuenta'} enviado por WhatsApp.`,
        type: "success",
        link: "/dashboard/medical-records"
      })

      return new Response(JSON.stringify({
        success: true,
        message: 'Simulación de subida exitosa',
        document
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 })
    }

    // --- MODO PRODUCCIÓN (INTEGRACIÓN CON META WHATSAPP WEBHOOK) ---
    // Estructura de Meta webhook: entry[] -> changes[] -> value -> messages[]
    if (body.object === 'whatsapp_business_account') {
      const entry = body.entry?.[0]
      const change = entry?.changes?.[0]
      const value = change?.value
      const message = value?.messages?.[0]

      if (!message) {
        return new Response('No message payload in webhook', { status: 200 })
      }

      const fromNumber = `+${message.from}` // Meta manda número sin el '+'
      const messageType = message.type // 'image' o 'document'

      if (messageType !== 'image' && messageType !== 'document') {
        console.log(`Mensaje ignorado, tipo no soportado: ${messageType}`)
        return new Response('Unsupported message type', { status: 200 })
      }

      const mediaData = message[messageType] // Contiene el id del recurso multimedia
      const mediaId = mediaData.id
      const fileName = mediaData.filename || `whatsapp_upload_${Date.now()}`

      console.log(`📩 Mensaje recibido de ${fromNumber}. Descargando mediaId: ${mediaId}`)

      // 1. Resolver el paciente por número de celular
      const { data: profile, error: profileErr } = await supabase
        .from('profiles')
        .select('id, full_name, family_group_id')
        .ilike('phone', `%${message.from}%`)
        .single()

      if (profileErr || !profile) {
        console.warn(`No se encontró paciente con número telefónico similar a: ${message.from}`)
        return new Response('Patient not found for this phone number', { status: 200 })
      }

      // 2. Resolver familiar si el usuario escribió un texto antes o después (opcional, por defecto al titular)
      let familyMemberId = null
      // Si hay mensajes en la ventana de chat, podríamos buscar el último mensaje de texto o buscar
      // palabras clave en el caption del documento enviado si lo provee Meta.
      const caption = message.image?.caption || message.document?.caption || ''
      if (caption && profile.family_group_id) {
        const { data: member } = await supabase
          .from('family_members')
          .select('id, full_name')
          .eq('family_group_id', profile.family_group_id)
          .ilike('full_name', `%${caption.trim()}%`)
          .limit(1)
          .maybeSingle()

        if (member) {
          familyMemberId = member.id
          console.log(`Asociando estudio al familiar: ${member.full_name} a pedido del caption de WhatsApp`)
        }
      }

      // 3. Descargar el archivo multimedia usando la API de Meta
      const whatsappToken = Deno.env.get('WHATSAPP_ACCESS_TOKEN')
      if (!whatsappToken) {
        throw new Error('Falta la variable de entorno WHATSAPP_ACCESS_TOKEN')
      }

      // Llama a Graph API para obtener la URL temporal del binario
      const graphRes = await fetch(`https://graph.facebook.com/v20.0/${mediaId}`, {
        headers: { 'Authorization': `Bearer ${whatsappToken}` }
      })
      if (!graphRes.ok) throw new Error(`Error en API de Meta al obtener media info: ${graphRes.statusText}`)
      const graphData = await graphRes.json()
      const mediaUrl = graphData.url

      // Descargar el binario real
      const fileRes = await fetch(mediaUrl, {
        headers: { 'Authorization': `Bearer ${whatsappToken}` }
      })
      if (!fileRes.ok) throw new Error('Error al descargar el archivo binario desde Meta CDN')
      const blob = await fileRes.blob()

      // 4. Subir a Supabase Storage
      const fileExt = messageType === 'image' ? 'jpg' : (fileName.split('.').pop() || 'pdf')
      const finalFileName = `whatsapp_${mediaId}.${fileExt}`
      const filePath = `${profile.id}/${finalFileName}`

      const { error: uploadError } = await supabase.storage
        .from('medical-documents')
        .upload(filePath, blob, { contentType: blob.type })

      if (uploadError) throw new Error(`Fallo al subir a Storage: ${uploadError.message}`)

      const { data: { publicUrl } } = supabase.storage
        .from('medical-documents')
        .getPublicUrl(filePath)

      // 5. Registrar en base de datos
      const { error: dbError } = await supabase
        .from('medical_documents')
        .insert([{
          patient_id: profile.id,
          family_member_id: familyMemberId,
          title: `Estudio vía WhatsApp — ${new Date().toLocaleDateString('es-AR')}`,
          type: messageType === 'image' ? 'imaging' : 'lab_result',
          url: publicUrl,
          uploaded_by: 'patient'
        }])

      if (dbError) throw dbError

      // 6. Enviar notificación push/realtime
      await supabase.from('notifications').insert({
        user_id: profile.id,
        title: "Nuevo estudio por WhatsApp",
        message: `Hemos procesado y guardado la imagen/PDF que enviaste a nuestro canal oficial.`,
        type: "success",
        link: "/dashboard/medical-records"
      })

      console.log(`✅ Documento procesado y guardado para paciente: ${profile.full_name}`)
      return new Response('SUCCESS', { status: 200 })
    }

    return new Response('Invalid webhook payload', { status: 400 })

  } catch (error) {
    console.error('❌ Error en el procesamiento del Webhook de WhatsApp:', error)
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500
    })
  }
})

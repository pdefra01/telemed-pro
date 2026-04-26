import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { AccessToken } from "npm:livekit-server-sdk@^2.15.1";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Solo permitir POST
    if (req.method !== 'POST') {
      return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: corsHeaders });
    }

    // Auth verification (Supabase Edge Functions inject the auth header)
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders });
    }

    const { appointmentId } = await req.json();

    if (!appointmentId) {
      return new Response(JSON.stringify({ error: 'appointmentId is required' }), { status: 400, headers: corsHeaders });
    }

    const apiKey = Deno.env.get('LIVEKIT_API_KEY');
    const apiSecret = Deno.env.get('LIVEKIT_API_SECRET');

    if (!apiKey || !apiSecret) {
      console.error("Faltan credenciales de LiveKit en el entorno (Edge Function)");
      return new Response(JSON.stringify({ error: 'Internal Server Error' }), { status: 500, headers: corsHeaders });
    }

    // Aquí deberíamos validar en la base de datos que este usuario (usando el token JWT de Supabase) 
    // tiene permisos para entrar a este `appointmentId`. Por simplicidad en esta fase, confiamos en la auth.
    
    // Obtenemos el nombre del participante (idealmente desde el JWT o la BD, aquí lo mockeamos por el momento)
    // Para Edge Functions, el payload del JWT de Supabase está en el auth header, podríamos decodificarlo.
    const participantName = `User-${Math.floor(Math.random() * 1000)}`;
    const roomName = `room-${appointmentId}`;

    const at = new AccessToken(apiKey, apiSecret, {
      identity: participantName,
      name: participantName,
    });

    at.addGrant({ roomJoin: true, room: roomName });

    const token = await at.toJwt();

    return new Response(
      JSON.stringify({ token, roomName }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200 
      }
    );
  } catch (error) {
    console.error("Error en LiveKit Edge Function:", error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    });
  }
});
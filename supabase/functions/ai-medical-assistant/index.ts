import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY');
const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`;

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { action, notes, context } = await req.json();

    if (!GEMINI_API_KEY) {
      throw new Error('GEMINI_API_KEY is not set');
    }

    let prompt = "";

    if (action === 'professionalize_notes') {
      prompt = `
        Eres un asistente médico experto. Tu tarea es convertir las siguientes notas rápidas y desprolijas de una consulta médica en una evolución clínica formal, profesional y estructurada siguiendo los estándares internacionales (S.O.A.P).
        
        Notas del médico: "${notes}"
        
        Instrucciones:
        - Usa terminología médica precisa.
        - Mantén un tono profesional y objetivo.
        - Divide en secciones: Subjetivo, Objetivo, Evaluación y Plan.
        - Idioma: Español Rioplatense/Latinoamericano profesional.
        - Sé conciso pero exhaustivo.
        - NO inventes datos que no estén en las notas, si faltan secciones de SOAP sé breve en ellas.
      `;
    } else if (action === 'suggest_diagnosis') {
      prompt = `
        Basado en las siguientes notas de evolución clínica de una consulta de telemedicina, sugiere 3 diagnósticos diferenciales posibles con sus respectivos códigos CIE-10.
        
        Notas: "${notes}"
        
        Formato de salida:
        1. [Código] Nombre del diagnóstico - Breve justificación.
        
        Aclara siempre que esto es una sugerencia basada en IA y el médico debe validar.
      `;
    } else {
      throw new Error('Invalid action');
    }

    const response = await fetch(GEMINI_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [{ text: prompt }]
        }]
      })
    });

    const data = await response.json();
    const resultText = data.candidates?.[0]?.content?.parts?.[0]?.text || "No se pudo generar una respuesta.";

    return new Response(
      JSON.stringify({ result: resultText }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
    );
  }
});

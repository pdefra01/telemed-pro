// Rules of the ai-medical-assistant edge function (tested with Vitest).
// Only a signed-in doctor can use it: the gateway's verify_jwt alone also
// accepts the public anon key, so the caller is checked here.

export const MAX_NOTES_LENGTH = 8000;

export interface AiAssistantDeps {
  // deno-lint-ignore no-explicit-any
  supabase: any; // service-role client
  /** Sends a prompt to the model and returns its text; null when no model is configured. */
  callModel: ((prompt: string) => Promise<string>) | null;
}

export interface AiAssistantResult {
  status: number;
  body: { result: string } | { error: string };
}

const fail = (status: number, error: string): AiAssistantResult => ({ status, body: { error } });

function buildPrompt(action: string, notes: string): string | null {
  if (action === 'professionalize_notes') {
    return `
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
  }
  if (action === 'suggest_diagnosis') {
    return `
        Basado en las siguientes notas de evolución clínica de una consulta de telemedicina, sugiere 3 diagnósticos diferenciales posibles con sus respectivos códigos CIE-10.

        Notas: "${notes}"

        Formato de salida:
        1. [Código] Nombre del diagnóstico - Breve justificación.

        Aclara siempre que esto es una sugerencia basada en IA y el médico debe validar.
      `;
  }
  return null;
}

export async function runAiAssistant(
  deps: AiAssistantDeps,
  // deno-lint-ignore no-explicit-any
  request: { token: string | null; body: any },
): Promise<AiAssistantResult> {
  const { supabase } = deps;

  // 1. Caller must be a signed-in doctor (roles come from user_roles).
  if (!request.token) return fail(401, 'Sesión requerida.');
  const { data: authData, error: authError } = await supabase.auth.getUser(request.token);
  const callerId = authData?.user?.id;
  if (authError || !callerId) return fail(401, 'Sesión inválida o vencida.');

  const { data: doctorRole, error: roleError } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', callerId)
    .eq('role', 'doctor')
    .maybeSingle();
  if (roleError) return fail(500, 'No se pudo verificar el usuario.');
  if (!doctorRole) return fail(403, 'Solo un médico puede usar el asistente de IA.');

  // 2. Input
  const action = typeof request.body?.action === 'string' ? request.body.action : '';
  const notes = typeof request.body?.notes === 'string' ? request.body.notes.trim() : '';
  if (!notes) return fail(400, 'Faltan las notas.');
  if (notes.length > MAX_NOTES_LENGTH) return fail(400, 'Las notas son demasiado largas.');
  const prompt = buildPrompt(action, notes);
  if (!prompt) return fail(400, 'Acción inválida.');

  // 3. Model
  if (!deps.callModel) return fail(503, 'El asistente de IA no está configurado.');
  try {
    const result = await deps.callModel(prompt);
    return { status: 200, body: { result } };
  } catch (err) {
    console.error('[ai-medical-assistant] model call failed:', (err as Error)?.message || err);
    return fail(502, 'El asistente de IA no respondió. Intentá de nuevo.');
  }
}

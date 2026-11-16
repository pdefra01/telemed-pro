/**
 * LLM behind the WhatsApp bot (odd/tasks/whatsapp-bot.md, S2-S3).
 *
 * `respond({ history, message, contactName })` returns
 * `{ reply, action: 'none' | 'adhesion' | 'handoff', name, summary }`.
 * The provider is chosen by env (BOT_LLM_PROVIDER, default "gemini"), so a
 * different one only needs another adapter with the same `respond`.
 */
import { GoogleGenAI, Type } from '@google/genai';

const ACTIONS = new Set(['none', 'adhesion', 'handoff']);

/** Facts from medinexsalud.com (home, servicios, sobre nosotros), read 2026-11-16. */
const SITE_KNOWLEDGE = `
QUÉ ES MEDINEX
- Plataforma argentina de salud digital y atención médica virtual: "Tu médico en casa, al instante".
- Conecta a personas y familias con médicos matriculados por video, chat o WhatsApp, desde casa, el trabajo o de viaje.
- No es una app de turnos: es un servicio de salud que acompaña. Atiende en todo el país.

SERVICIOS (todos incluidos en un único plan mensual familiar)
1. Consultas médicas virtuales: en tiempo real por video o chat, desde celular, tablet o computadora. Atención clínica y pediátrica. Conexión en minutos.
2. Recetas electrónicas: se emiten al terminar la consulta, válidas en farmacias de todo el país, para medicación crónica y aguda, sin costo adicional.
3. Solicitud de estudios: análisis de sangre, orina, laboratorio general e imágenes (ecografías, radiografías y otros). Orden digital al instante, válida en laboratorios de todo el país.
4. Evaluación de estudios: el paciente comparte sus resultados y recibe una interpretación profesional clara con indicaciones de seguimiento si corresponde.
5. Acompañamiento en patologías crónicas: seguimiento continuo (diabetes, cardiopatías, enfermedades renales, celiaquía y otras).

CÓMO FUNCIONA
1. Contactar a Medinex por WhatsApp o la web. 2. Elegir el tipo de atención. 3. Completar los datos. 4. Un médico matriculado revisa y valida. 5. Recibir la documentación médica digital.
Para usar los servicios hay que estar adherido al plan.

PREGUNTAS FRECUENTES
- ¿Es telemedicina? Sí. Cubre la mayoría de las consultas cotidianas, pero no reemplaza las urgencias graves ni la atención presencial especializada.
- ¿La documentación es válida? Sí: recetas y pedidos de estudios los emiten médicos matriculados y tienen validez legal en farmacias y centros de salud de todo el país.
- ¿Cuánto demora la respuesta? En promedio menos de 15 minutos; según el servicio y el horario la documentación puede llegar en minutos.
- ¿Necesito turno previo? No es obligatorio: se puede pedir atención inmediata o programar un turno según disponibilidad.
- ¿Puedo pedir documentación en cualquier momento? Sí, se escribe cuando haga falta y un médico responde a la brevedad.
- ¿El plan cubre a toda mi familia? Sí: con un solo plan se incluye al grupo familiar (pareja, hijos y más) con un único pago mensual.
- ¿Puedo renovar la misma documentación cada mes? Sí, para tratamientos habituales la receta o el pedido se renuevan mensualmente sin repetir todo el proceso.

LO QUE EL SITIO NO DICE (no lo inventes)
- Precios o montos del plan, nombres de planes, horarios de atención, límite de integrantes o edades del grupo familiar, convenios con obras sociales o prepagas, medios de pago.

CONTACTO
- Email: info@medinex.com.ar
- Privacidad: la información de salud no se comparte ni se vende.
`;

export function buildSystemPrompt({ adhesionUrl }) {
  return `Sos el asistente virtual de Medinex en WhatsApp. Respondés a personas que todavía no son afiliadas.
Tu objetivo: dar la bienvenida, aclarar dudas usando SOLO la información de abajo, y llevar a la persona a adherirse online o a hablar con un asesor.

REGLAS
- Español rioplatense, cálido y breve: 1 a 4 oraciones, sin markdown ni listas largas. Como mucho un emoji.
- Usá solo la información de abajo. Si no está, no la inventes: ofrecé que un asesor la contacte.
- Si preguntan precio, costo, cuota, formas de pago, obras sociales o algo que no está en la información, ofrecé que un asesor la contacte. Nunca des montos.
- Nunca des consejos médicos, diagnósticos ni dosis. Para atenderse con un médico hay que estar adherido.
- Si describe una emergencia (dolor de pecho, dificultad para respirar, pérdida de conocimiento, sangrado abundante, etc.), decile que llame YA al 107 (SAME) o al 911, antes que cualquier otra cosa.
- Si quiere adherirse o contratar, usá action "adhesion" e incluí este link: ${adhesionUrl}
- Usá action "handoff" cuando pida hablar con una persona o un asesor, pregunte precios u otra cosa que no sabés, o acepte que un asesor la contacte. En ese caso decile que un asesor la va a contactar por WhatsApp a la brevedad, completá "summary" con una línea sobre qué necesita (sin datos de salud) y "name" con su nombre si lo dijo.
- En cualquier otro caso usá action "none".
- No pidas datos de salud ni documentos.

INFORMACIÓN DE MEDINEX
${SITE_KNOWLEDGE}`;
}

const RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    reply: { type: Type.STRING, description: 'Mensaje de WhatsApp para la persona.' },
    action: { type: Type.STRING, enum: ['none', 'adhesion', 'handoff'] },
    name: { type: Type.STRING, description: 'Nombre de la persona si lo dijo.', nullable: true },
    summary: { type: Type.STRING, description: 'Qué necesita, en una línea (solo en handoff).', nullable: true },
  },
  required: ['reply', 'action'],
};

function parseResult(text) {
  const data = JSON.parse(text);
  const reply = typeof data?.reply === 'string' ? data.reply.trim() : '';
  if (!reply) throw new Error('LLM returned an empty reply');
  return {
    reply,
    action: ACTIONS.has(data.action) ? data.action : 'none',
    name: typeof data.name === 'string' && data.name.trim() ? data.name.trim() : null,
    summary: typeof data.summary === 'string' && data.summary.trim() ? data.summary.trim() : null,
  };
}

export function createGeminiBotLlm({ client, model, adhesionUrl }) {
  const systemInstruction = buildSystemPrompt({ adhesionUrl });
  return {
    async respond({ history = [], message, contactName = null }) {
      const contents = [
        ...history.map((h) => ({ role: h.role === 'bot' ? 'model' : 'user', parts: [{ text: h.text }] })),
        {
          role: 'user',
          parts: [{ text: contactName ? `[Nombre de perfil de WhatsApp: ${contactName}]\n${message}` : message }],
        },
      ];
      const response = await client.models.generateContent({
        model,
        contents,
        config: {
          systemInstruction,
          responseMimeType: 'application/json',
          responseSchema: RESPONSE_SCHEMA,
          temperature: 0.3,
          maxOutputTokens: 600,
          // 2.5 Flash thinks by default and thinking tokens count toward the
          // output limit, which could truncate the JSON answer.
          thinkingConfig: { thinkingBudget: 0 },
        },
      });
      return parseResult(response.text ?? '');
    },
  };
}

/** Provider factory from env. Returns null when no API key is set (bot disabled). */
export function createBotLlm({ provider = 'gemini', apiKey, model, adhesionUrl }) {
  if (provider !== 'gemini') throw new Error(`Unknown BOT_LLM_PROVIDER provider: ${provider}`);
  if (!apiKey) return null;
  return createGeminiBotLlm({
    client: new GoogleGenAI({ apiKey }),
    model: model || 'gemini-2.5-flash',
    adhesionUrl,
  });
}

/**
 * WhatsApp bot on the Medinex number (odd/tasks/whatsapp-bot.md, S1-S6).
 *
 * WAHA posts every inbound message to POST /api/whatsapp/webhook (signed with
 * HMAC-SHA512). The bot routes by who is writing:
 *   - staff (advisor, doctor, admin profile): no reply;
 *   - affiliate: the fixed affiliate menu, at most once every 12 hours;
 *   - unknown: the LLM answers from the medinexsalud.com knowledge, refers to
 *     the adhesion form, or hands off to an advisor (CRM prospect assigned
 *     round-robin + WhatsApp notice to the advisor), after which the bot is
 *     silent in that chat for 7 days.
 * The number is unofficial (WAHA), so replies are delayed and capped per chat
 * to lower the risk of a ban on the number that also sends recetas.
 */
import crypto from 'node:crypto';
import { normalizeArgentinePhone } from './whatsapp.js';

export const AFFILIATE_MENU_TEXT = [
  '¡Hola! Ya sos afiliado/a de Medinex 👋',
  '',
  'Para pedir una consulta, ver tus turnos o descargar tus recetas, ingresá a la app: https://medinex.duckdns.org',
  '',
  'Para cualquier otra consulta escribinos a info@medinex.com.ar y te respondemos a la brevedad.',
].join('\n');

export const FALLBACK_TEXT =
  '¡Gracias por escribirnos! En este momento no puedo responderte. Escribinos a info@medinex.com.ar y te contactamos a la brevedad.';

export const NO_ADVISOR_TEXT =
  'En este momento no hay asesores disponibles. Escribinos a info@medinex.com.ar con tu consulta y te contactamos a la brevedad.';

const HISTORY_LIMIT = 20;
const AFFILIATE_MENU_EVERY_MS = 12 * 60 * 60 * 1000;
const HANDOFF_SILENCE_MS = 7 * 24 * 60 * 60 * 1000;
const HOURLY_REPLY_CAP = 10;
const HOUR_MS = 60 * 60 * 1000;

/** Verifies WAHA's X-Webhook-Hmac (hex HMAC-SHA512 of the raw body). */
export function verifyWebhookHmac(rawBody, headerValue, key) {
  if (!key || typeof headerValue !== 'string' || !Buffer.isBuffer(rawBody)) return false;
  const expected = crypto.createHmac('sha512', key).update(rawBody).digest();
  let received;
  try {
    received = Buffer.from(headerValue.trim(), 'hex');
  } catch {
    return false;
  }
  return received.length === expected.length && crypto.timingSafeEqual(received, expected);
}

/** Phone (549XXXXXXXXXX or international digits) from a `@c.us` id, else null. */
function phoneFromChatId(chatId) {
  const digits = String(chatId).split('@')[0].replace(/\D/g, '');
  if (!digits) return null;
  return digits.startsWith('54') ? normalizeArgentinePhone(digits) : normalizeArgentinePhone(`+${digits}`);
}

function isDirectChat(chatId) {
  return typeof chatId === 'string' && (chatId.endsWith('@c.us') || chatId.endsWith('@lid'));
}

function typingDelayMs(text) {
  return Math.min(4000, 1500 + text.length * 15);
}

export function createWhatsappBot({ store, waha, llm, adhesionUrl, now = () => new Date(), sleep, log = console }) {
  const wait = sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));

  async function reply(chatId, text) {
    await wait(typingDelayMs(text));
    await waha.sendToChat({ chatId, text });
  }

  async function resolvePhone(chatId) {
    if (chatId.endsWith('@c.us')) return phoneFromChatId(chatId);
    try {
      const pn = await waha.getPhoneByLid(chatId);
      return pn ? phoneFromChatId(`${pn}`) : null;
    } catch (err) {
      log.warn?.('[whatsapp-bot] lid lookup failed:', err.message);
      return null;
    }
  }

  async function notifyAdvisor(lead, { fullName, phone, summary }) {
    const advisorPhone = normalizeArgentinePhone(lead.advisor_phone);
    if (!advisorPhone) {
      log.warn?.('[whatsapp-bot] advisor has no valid phone, lead not notified:', lead.advisor_id);
      return;
    }
    const text = [
      lead.reused ? 'Tu prospecto volvió a escribir al WhatsApp de Medinex' : 'Nuevo contacto del bot de WhatsApp de Medinex',
      `Nombre: ${fullName || 'sin nombre'}`,
      `Teléfono: +${phone}`,
      `Resumen: ${summary || 'sin resumen'}`,
      'Ya está en tu CRM como prospecto. Contactalo a la brevedad.',
    ].join('\n');
    try {
      await waha.sendText({ phone: advisorPhone, text });
    } catch (err) {
      log.error?.('[whatsapp-bot] advisor notice failed:', err.message);
    }
  }

  // One chain per chat: a burst of messages is answered in order, each with the
  // history the previous one left (single server process).
  const chains = new Map();
  function handleEvent(event) {
    const chatId = event?.payload?.from;
    const prev = chains.get(chatId) ?? Promise.resolve();
    const next = prev.catch(() => {}).then(() => processEvent(event));
    chains.set(chatId, next);
    next.finally(() => {
      if (chains.get(chatId) === next) chains.delete(chatId);
    }).catch(() => {});
    return next;
  }

  async function processEvent(event) {
    if (event?.event !== 'message') return;
    const msg = event.payload ?? {};
    if (msg.fromMe || !isDirectChat(msg.from) || !msg.id) return;
    if (!(await store.markInbound(String(msg.id)))) return;

    const chatId = msg.from;
    const at = now();
    const phone = await resolvePhone(chatId);
    const kind = phone ? await store.contactKind(phone) : 'unknown';
    if (kind === 'staff') return;

    const key = phone ?? chatId;
    const contactName = msg._data?.notifyName || null;
    const conv = (await store.getConversation(key)) ?? { phone: key, mode: 'bot', history: [] };
    conv.history = Array.isArray(conv.history) ? conv.history : [];
    conv.contact_name = conv.contact_name || contactName;
    conv.last_inbound_at = at.toISOString();

    const lastBot = [...conv.history].reverse().find((h) => h.role === 'bot');
    const botRepliesLastHour = conv.history.filter(
      (h) => h.role === 'bot' && at - new Date(h.at) < HOUR_MS,
    ).length;
    const pushBot = (text) => conv.history.push({ role: 'bot', text, at: at.toISOString() });
    const save = () => {
      conv.history = conv.history.slice(-HISTORY_LIMIT);
      return store.saveConversation(conv);
    };

    if (kind === 'affiliate') {
      // Affiliate messages may carry health data: they are not stored.
      if (lastBot && at - new Date(lastBot.at) < AFFILIATE_MENU_EVERY_MS) return save();
      await reply(chatId, AFFILIATE_MENU_TEXT);
      pushBot(AFFILIATE_MENU_TEXT);
      return save();
    }

    if (conv.mode === 'handed_off') {
      if (conv.handed_off_at && at - new Date(conv.handed_off_at) < HANDOFF_SILENCE_MS) return save();
      conv.mode = 'bot';
    }

    const text = typeof msg.body === 'string' ? msg.body.trim() : '';
    const priorHistory = conv.history.map(({ role, text: t }) => ({ role, text: t }));
    conv.history.push({ role: 'user', text: text || '[mensaje sin texto]', at: at.toISOString() });

    if (botRepliesLastHour >= HOURLY_REPLY_CAP) {
      log.warn?.('[whatsapp-bot] hourly reply cap reached for', key);
      return save();
    }

    let result;
    try {
      result = await llm.respond({ history: priorHistory, message: text || '[mensaje sin texto]', contactName });
    } catch (err) {
      log.error?.('[whatsapp-bot] llm failed:', err.message);
      await reply(chatId, FALLBACK_TEXT);
      pushBot(FALLBACK_TEXT);
      return save();
    }

    let out = result.reply;
    if (result.action === 'adhesion' && !out.includes(adhesionUrl)) out = `${out}\n\n${adhesionUrl}`;

    if (result.action === 'handoff') {
      const fullName = result.name || contactName || null;
      const notes = [
        'Lead del bot de WhatsApp.',
        `Resumen: ${result.summary || 'sin resumen'}`,
        '',
        'Últimos mensajes:',
        ...conv.history.slice(-6).map((h) => `${h.role === 'user' ? 'Contacto' : 'Bot'}: ${h.text}`),
      ].join('\n');
      let lead = null;
      try {
        lead = phone ? await store.assignLead({ fullName, phone, notes }) : null;
      } catch (err) {
        log.error?.('[whatsapp-bot] lead assignment failed:', err.message);
      }
      if (!lead) {
        await reply(chatId, NO_ADVISOR_TEXT);
        pushBot(NO_ADVISOR_TEXT);
        return save();
      }
      await notifyAdvisor(lead, { fullName, phone, summary: result.summary });
      conv.mode = 'handed_off';
      conv.prospect_id = lead.prospect_id;
      conv.handed_off_at = at.toISOString();
    }

    await reply(chatId, out);
    pushBot(out);
    return save();
  }

  return { handleEvent };
}

/** Supabase-backed persistence for the bot (service_role client). */
export function createSupabaseBotStore(supabaseAdmin) {
  return {
    async markInbound(messageId) {
      const { error } = await supabaseAdmin.from('whatsapp_bot_inbound').insert({ message_id: messageId });
      if (!error) return true;
      if (error.code === '23505') return false;
      throw new Error(error.message);
    },
    async getConversation(phone) {
      const { data, error } = await supabaseAdmin
        .from('whatsapp_bot_conversations')
        .select('*')
        .eq('phone', phone)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return data;
    },
    async saveConversation(row) {
      const { error } = await supabaseAdmin
        .from('whatsapp_bot_conversations')
        .upsert({ ...row, updated_at: new Date().toISOString() });
      if (error) throw new Error(error.message);
    },
    async contactKind(phone) {
      const { data, error } = await supabaseAdmin.rpc('whatsapp_bot_contact_kind', { p_phone: phone });
      if (error) throw new Error(error.message);
      return data;
    },
    async assignLead({ fullName, phone, notes }) {
      const { data, error } = await supabaseAdmin.rpc('assign_whatsapp_bot_lead', {
        p_full_name: fullName,
        p_phone: phone,
        p_notes: notes,
      });
      if (error) throw new Error(error.message);
      return Array.isArray(data) ? data[0] ?? null : data ?? null;
    },
  };
}

/**
 * Express handler for POST /api/whatsapp/webhook. Mount it with
 * `express.raw({ type: '*\/*' })` so the HMAC is checked on the exact bytes.
 * Answers 200 right away (WAHA retries slow or failed deliveries) and
 * processes the event afterwards.
 */
export function whatsappWebhookHandler({ bot, hmacKey, log = console }) {
  return async (req, res) => {
    if (!bot || !hmacKey) return res.status(404).json({ error: 'not_found' });
    const raw = Buffer.isBuffer(req.body) ? req.body : Buffer.from('');
    if (!verifyWebhookHmac(raw, req.headers['x-webhook-hmac'], hmacKey)) {
      return res.status(401).json({ error: 'invalid_signature' });
    }
    let event;
    try {
      event = JSON.parse(raw.toString('utf8'));
    } catch {
      return res.status(400).json({ error: 'invalid_json' });
    }
    res.status(200).json({ ok: true });
    Promise.resolve()
      .then(() => bot.handleEvent(event))
      .catch((err) => log.error?.('[whatsapp-bot] event failed:', err.message));
  };
}

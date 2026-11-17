import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  verifyWebhookHmac,
  createWhatsappBot,
  whatsappWebhookHandler,
  AFFILIATE_MENU_TEXT,
  FALLBACK_TEXT,
} from '../whatsappBot.js';

const ADHESION_URL = 'https://medinex.duckdns.org/#/adhesion?promoter=LANDING';
const NOW = new Date('2026-11-16T15:00:00.000Z');

function memoryStore({ kind = 'unknown', lead = null } = {}) {
  const inbound = new Set();
  const conversations = new Map();
  return {
    conversations,
    markInbound: vi.fn(async (id) => {
      if (inbound.has(id)) return false;
      inbound.add(id);
      return true;
    }),
    getConversation: vi.fn(async (phone) => conversations.get(phone) ?? null),
    saveConversation: vi.fn(async (row) => {
      conversations.set(row.phone, structuredClone(row));
    }),
    contactKind: vi.fn(async () => kind),
    assignLead: vi.fn(async () => lead),
  };
}

function fakeWaha() {
  return {
    sendToChat: vi.fn(async () => {}),
    sendText: vi.fn(async () => {}),
    getPhoneByLid: vi.fn(async () => '5493871112222'),
  };
}

function inboundEvent(overrides = {}) {
  return {
    event: 'message',
    session: 'default',
    payload: {
      id: 'false_5493874445555@c.us_ABC',
      from: '5493874445555@c.us',
      fromMe: false,
      body: 'Hola, quiero saber más sobre Medinex',
      hasMedia: false,
      _data: { notifyName: 'Laura' },
      ...overrides,
    },
  };
}

function setup({ kind, lead, llmResult, llmError } = {}) {
  const store = memoryStore({ kind, lead });
  const waha = fakeWaha();
  const llm = {
    respond: llmError
      ? vi.fn(async () => { throw llmError; })
      : vi.fn(async () => llmResult ?? { reply: 'Hola Laura, ¿en qué te ayudo?', action: 'none' }),
  };
  const bot = createWhatsappBot({
    store,
    waha,
    llm,
    adhesionUrl: ADHESION_URL,
    now: () => NOW,
    sleep: async () => {},
  });
  return { bot, store, waha, llm };
}

describe('verifyWebhookHmac', () => {
  // Example published in the WAHA docs (how-to/events, HMAC authentication).
  const body = '{"event":"message","session":"default","engine":"WEBJS"}';
  const mac = '208f8a55dde9e05519e898b10b89bf0d0b3b0fdf11fdbf09b6b90476301b98d8097c462b2b17a6ce93b6b47a136cf2e78a33a63f6752c2c1631777076153fa89';

  it('accepts the WAHA documented example', () => {
    expect(verifyWebhookHmac(Buffer.from(body), mac, 'my-secret-key')).toBe(true);
  });

  it('rejects a wrong key, a tampered body and a missing header', () => {
    expect(verifyWebhookHmac(Buffer.from(body), mac, 'other-key')).toBe(false);
    expect(verifyWebhookHmac(Buffer.from(body + ' '), mac, 'my-secret-key')).toBe(false);
    expect(verifyWebhookHmac(Buffer.from(body), undefined, 'my-secret-key')).toBe(false);
    expect(verifyWebhookHmac(Buffer.from(body), mac, '')).toBe(false);
  });
});

describe('createWhatsappBot.handleEvent', () => {
  it('ignores own messages, groups, status and non-message events', async () => {
    const { bot, waha, store } = setup();
    await bot.handleEvent(inboundEvent({ fromMe: true }));
    await bot.handleEvent(inboundEvent({ id: 'g1', from: '120363@g.us' }));
    await bot.handleEvent(inboundEvent({ id: 's1', from: 'status@broadcast' }));
    await bot.handleEvent({ event: 'session.status', payload: {} });
    expect(waha.sendToChat).not.toHaveBeenCalled();
    expect(store.contactKind).not.toHaveBeenCalled();
  });

  it('handles a retried webhook (same message id) only once', async () => {
    const { bot, waha } = setup();
    await bot.handleEvent(inboundEvent());
    await bot.handleEvent(inboundEvent());
    expect(waha.sendToChat).toHaveBeenCalledTimes(1);
  });

  it('does not reply to staff (advisors, doctors, admins)', async () => {
    const { bot, waha, llm } = setup({ kind: 'staff' });
    await bot.handleEvent(inboundEvent());
    expect(waha.sendToChat).not.toHaveBeenCalled();
    expect(llm.respond).not.toHaveBeenCalled();
  });

  it('answers an affiliate with the affiliate menu, at most once every 12 hours', async () => {
    const { bot, waha, llm, store } = setup({ kind: 'affiliate' });
    await bot.handleEvent(inboundEvent());
    await bot.handleEvent(inboundEvent({ id: 'second' }));
    expect(llm.respond).not.toHaveBeenCalled();
    expect(waha.sendToChat).toHaveBeenCalledTimes(1);
    expect(waha.sendToChat).toHaveBeenCalledWith({ chatId: '5493874445555@c.us', text: AFFILIATE_MENU_TEXT });
    expect(store.conversations.get('5493874445555').history.at(-1)).toMatchObject({ role: 'bot' });
  });

  it('answers an unknown contact with the LLM reply and keeps the history', async () => {
    const { bot, waha, llm, store } = setup();
    await bot.handleEvent(inboundEvent());
    expect(llm.respond).toHaveBeenCalledWith({
      history: [],
      message: 'Hola, quiero saber más sobre Medinex',
      contactName: 'Laura',
    });
    expect(waha.sendToChat).toHaveBeenCalledWith({ chatId: '5493874445555@c.us', text: 'Hola Laura, ¿en qué te ayudo?' });
    const conv = store.conversations.get('5493874445555');
    expect(conv.mode).toBe('bot');
    expect(conv.history.map((h) => h.role)).toEqual(['user', 'bot']);
  });

  it('adds the adhesion link when the LLM refers to the form without it', async () => {
    const { bot, waha } = setup({ llmResult: { reply: 'Podés adherirte online.', action: 'adhesion' } });
    await bot.handleEvent(inboundEvent());
    expect(waha.sendToChat.mock.calls[0][0].text).toContain(ADHESION_URL);
  });

  it('hands off to an advisor: creates the lead, notifies the advisor and goes silent', async () => {
    const lead = { prospect_id: 'pros-1', advisor_id: 'adv-1', advisor_name: 'Pedro', advisor_phone: '387 15 600-0000', reused: false };
    const { bot, waha, store } = setup({
      lead,
      llmResult: { reply: 'Te contacta un asesor en breve.', action: 'handoff', name: 'Laura Díaz', summary: 'Pregunta precios para 4 personas.' },
    });
    await bot.handleEvent(inboundEvent());

    expect(store.assignLead).toHaveBeenCalledWith({
      fullName: 'Laura Díaz',
      phone: '5493874445555',
      notes: expect.stringContaining('Pregunta precios para 4 personas.'),
    });
    expect(waha.sendText).toHaveBeenCalledWith({
      phone: '5493876000000',
      text: expect.stringContaining('Laura Díaz'),
    });
    expect(waha.sendToChat).toHaveBeenCalledWith({ chatId: '5493874445555@c.us', text: 'Te contacta un asesor en breve.' });
    const conv = store.conversations.get('5493874445555');
    expect(conv).toMatchObject({ mode: 'handed_off', prospect_id: 'pros-1', handed_off_at: NOW.toISOString() });

    await bot.handleEvent(inboundEvent({ id: 'after-handoff', body: '¿Hola?' }));
    expect(waha.sendToChat).toHaveBeenCalledTimes(1);
  });

  it('resumes the bot 7 days after a handoff', async () => {
    const { bot, waha, store } = setup();
    store.conversations.set('5493874445555', {
      phone: '5493874445555',
      mode: 'handed_off',
      history: [],
      handed_off_at: new Date(NOW.getTime() - 8 * 86400000).toISOString(),
    });
    await bot.handleEvent(inboundEvent());
    expect(waha.sendToChat).toHaveBeenCalledTimes(1);
    expect(store.conversations.get('5493874445555').mode).toBe('bot');
  });

  it('falls back to the contact email when nobody is in the rotation', async () => {
    const { bot, waha, store } = setup({
      lead: null,
      llmResult: { reply: 'Te contacta un asesor.', action: 'handoff', summary: 'Quiere hablar con alguien.' },
    });
    await bot.handleEvent(inboundEvent());
    expect(waha.sendText).not.toHaveBeenCalled();
    expect(waha.sendToChat.mock.calls[0][0].text).toContain('info@medinex.com.ar');
    expect(store.conversations.get('5493874445555').mode).toBe('bot');
  });

  it('sends the fallback text when the LLM fails', async () => {
    const { bot, waha } = setup({ llmError: new Error('quota') });
    await bot.handleEvent(inboundEvent());
    expect(waha.sendToChat).toHaveBeenCalledWith({ chatId: '5493874445555@c.us', text: FALLBACK_TEXT });
  });

  it('stops replying after 10 bot replies in the last hour', async () => {
    const { bot, waha, store } = setup();
    const recent = new Date(NOW.getTime() - 5 * 60000).toISOString();
    store.conversations.set('5493874445555', {
      phone: '5493874445555',
      mode: 'bot',
      history: [],
      bot_reply_times: Array.from({ length: 10 }, () => recent),
    });
    await bot.handleEvent(inboundEvent());
    expect(waha.sendToChat).not.toHaveBeenCalled();
  });

  it('processes messages of the same chat one at a time, each seeing the previous reply', async () => {
    const { bot, llm } = setup();
    await Promise.all([
      bot.handleEvent(inboundEvent({ id: 'm1', body: 'Hola' })),
      bot.handleEvent(inboundEvent({ id: 'm2', body: '¿Qué incluye?' })),
    ]);
    expect(llm.respond).toHaveBeenCalledTimes(2);
    expect(llm.respond.mock.calls[1][0].history.map((h) => h.role)).toEqual(['user', 'bot']);
  });

  it('keeps the hourly cap under a flood: 60 messages in a minute get 10 replies', async () => {
    const store = memoryStore();
    const waha = fakeWaha();
    const llm = { respond: vi.fn(async () => ({ reply: 'ok', action: 'none' })) };
    let t = NOW.getTime();
    const bot = createWhatsappBot({ store, waha, llm, adhesionUrl: ADHESION_URL, now: () => new Date(t), sleep: async () => {} });
    for (let i = 0; i < 60; i += 1) {
      await bot.handleEvent(inboundEvent({ id: `flood-${i}`, body: `m${i}` }));
      t += 1000;
    }
    expect(llm.respond).toHaveBeenCalledTimes(10);
    expect(waha.sendToChat).toHaveBeenCalledTimes(10);
  });

  it('strips links from the name and summary sent to the advisor', async () => {
    const lead = { prospect_id: 'p', advisor_id: 'a', advisor_name: 'Pedro', advisor_phone: '3876000000', reused: false };
    const { bot, waha } = setup({
      lead,
      llmResult: { reply: 'Te contacta un asesor.', action: 'handoff', name: 'Ana https://evil.example/x', summary: 'Entrá a www.evil.example ya' },
    });
    await bot.handleEvent(inboundEvent());
    const notice = waha.sendText.mock.calls[0][0].text;
    expect(notice).not.toMatch(/evil\.example/);
  });

  it('resolves a hidden @lid sender to its phone number', async () => {
    const { bot, waha, store } = setup();
    await bot.handleEvent(inboundEvent({ id: 'lid-1', from: '123456789@lid' }));
    expect(waha.getPhoneByLid).toHaveBeenCalledWith('123456789@lid');
    expect(store.contactKind).toHaveBeenCalledWith('5493871112222');
    expect(waha.sendToChat).toHaveBeenCalledWith({ chatId: '123456789@lid', text: expect.any(String) });
  });
});

describe('whatsappWebhookHandler', () => {
  function res() {
    return { status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis() };
  }
  const body = '{"event":"message","session":"default","engine":"WEBJS"}';
  const mac = '208f8a55dde9e05519e898b10b89bf0d0b3b0fdf11fdbf09b6b90476301b98d8097c462b2b17a6ce93b6b47a136cf2e78a33a63f6752c2c1631777076153fa89';

  let bot;
  beforeEach(() => {
    bot = { handleEvent: vi.fn(async () => {}) };
  });

  it('returns 404 when the bot is not configured', async () => {
    const r = res();
    await whatsappWebhookHandler({ bot: null, hmacKey: 'k' })({ body: Buffer.from(body), headers: {} }, r);
    expect(r.status).toHaveBeenCalledWith(404);
  });

  it('returns 401 on a bad signature and does not process the event', async () => {
    const r = res();
    await whatsappWebhookHandler({ bot, hmacKey: 'my-secret-key' })(
      { body: Buffer.from(body), headers: { 'x-webhook-hmac': 'bad' } }, r,
    );
    expect(r.status).toHaveBeenCalledWith(401);
    expect(bot.handleEvent).not.toHaveBeenCalled();
  });

  it('acknowledges a signed event with 200 and processes it', async () => {
    const r = res();
    await whatsappWebhookHandler({ bot, hmacKey: 'my-secret-key' })(
      { body: Buffer.from(body), headers: { 'x-webhook-hmac': mac } }, r,
    );
    expect(r.status).toHaveBeenCalledWith(200);
    await vi.waitFor(() => expect(bot.handleEvent).toHaveBeenCalledWith(JSON.parse(body)));
  });
});

describe('server.js wiring', () => {
  it('mounts the webhook with a raw body parser before the global JSON parser', async () => {
    const { readFileSync } = await import('node:fs');
    const { resolve, dirname } = await import('node:path');
    const { fileURLToPath } = await import('node:url');
    const src = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../../server.js'), 'utf8');
    const route = src.indexOf("app.post('/api/whatsapp/webhook', express.raw(");
    const json = src.indexOf("app.use(express.json(");
    expect(route).toBeGreaterThan(-1);
    expect(route).toBeLessThan(json);
    expect(src).toMatch(/process\.env\.WHATSAPP_BOT_ENABLED === 'true'/);
  });
});

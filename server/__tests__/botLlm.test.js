import { describe, it, expect, vi } from 'vitest';
import { createBotLlm, createGeminiBotLlm, buildSystemPrompt } from '../botLlm.js';

const ADHESION_URL = 'https://medinex.duckdns.org/#/adhesion?promoter=LANDING';

function fakeClient(text) {
  return { models: { generateContent: vi.fn(async () => ({ text })) } };
}

describe('buildSystemPrompt', () => {
  it('carries the site facts, the adhesion link and the hard rules', () => {
    const prompt = buildSystemPrompt({ adhesionUrl: ADHESION_URL });
    expect(prompt).toContain(ADHESION_URL);
    expect(prompt).toContain('info@medinex.com.ar');
    expect(prompt).toMatch(/107/);
    expect(prompt).toMatch(/precio/i);
  });
});

describe('createGeminiBotLlm', () => {
  it('sends the history as alternating turns with a JSON schema and parses the answer', async () => {
    const client = fakeClient(JSON.stringify({ reply: 'Hola!', action: 'none' }));
    const llm = createGeminiBotLlm({ client, model: 'gemini-2.5-flash', adhesionUrl: ADHESION_URL });

    const out = await llm.respond({
      history: [{ role: 'user', text: 'Hola' }, { role: 'bot', text: '¿En qué te ayudo?' }],
      message: '¿Qué incluye?',
      contactName: 'Laura',
    });

    expect(out).toEqual({ reply: 'Hola!', action: 'none', name: null, summary: null });
    const req = client.models.generateContent.mock.calls[0][0];
    expect(req.model).toBe('gemini-2.5-flash');
    expect(req.contents.map((c) => c.role)).toEqual(['user', 'model', 'user']);
    expect(req.contents.at(-1).parts[0].text).toContain('¿Qué incluye?');
    expect(req.config.responseMimeType).toBe('application/json');
    expect(req.config.responseSchema).toBeDefined();
    expect(req.config.systemInstruction).toContain(ADHESION_URL);
  });

  it('keeps handoff name and summary', async () => {
    const client = fakeClient(JSON.stringify({ reply: 'Te contacta un asesor.', action: 'handoff', name: 'Laura Díaz', summary: 'Precios' }));
    const llm = createGeminiBotLlm({ client, model: 'm', adhesionUrl: ADHESION_URL });
    expect(await llm.respond({ history: [], message: '¿Precio?', contactName: null }))
      .toEqual({ reply: 'Te contacta un asesor.', action: 'handoff', name: 'Laura Díaz', summary: 'Precios' });
  });

  it('downgrades an unknown action to none and rejects an empty reply', async () => {
    const llm1 = createGeminiBotLlm({ client: fakeClient(JSON.stringify({ reply: 'Ok', action: 'buy' })), model: 'm', adhesionUrl: ADHESION_URL });
    expect((await llm1.respond({ history: [], message: 'x' })).action).toBe('none');

    const llm2 = createGeminiBotLlm({ client: fakeClient(JSON.stringify({ reply: '  ', action: 'none' })), model: 'm', adhesionUrl: ADHESION_URL });
    await expect(llm2.respond({ history: [], message: 'x' })).rejects.toThrow(/empty/);

    const llm3 = createGeminiBotLlm({ client: fakeClient('not json'), model: 'm', adhesionUrl: ADHESION_URL });
    await expect(llm3.respond({ history: [], message: 'x' })).rejects.toThrow();
  });
});

describe('createBotLlm', () => {
  it('returns null without an API key and rejects an unknown provider', () => {
    expect(createBotLlm({ provider: 'gemini', apiKey: '', adhesionUrl: ADHESION_URL })).toBeNull();
    expect(() => createBotLlm({ provider: 'other', apiKey: 'k', adhesionUrl: ADHESION_URL })).toThrow(/provider/);
  });
});

import { describe, it, expect, vi, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  purgeWhatsappBotData,
  startWhatsappBotRetentionJob,
  CONVERSATION_RETENTION_DAYS,
  INBOUND_RETENTION_DAYS,
} from '../whatsappBotRetention.js';

const NOW = new Date('2026-11-16T15:00:00.000Z');

function fakeSupabase({ error = null } = {}) {
  const calls = [];
  return {
    calls,
    from(table) {
      return {
        delete() {
          return {
            lt(column, value) {
              calls.push({ table, column, value });
              return Promise.resolve({ error });
            },
          };
        },
      };
    },
  };
}

describe('purgeWhatsappBotData', () => {
  it('deletes conversations idle for 30 days and processed ids older than 7 days', async () => {
    const sb = fakeSupabase();
    await purgeWhatsappBotData({ supabaseAdmin: sb, now: () => NOW });
    expect(CONVERSATION_RETENTION_DAYS).toBe(30);
    expect(INBOUND_RETENTION_DAYS).toBe(7);
    expect(sb.calls).toEqual([
      { table: 'whatsapp_bot_conversations', column: 'updated_at', value: '2026-10-17T15:00:00.000Z' },
      { table: 'whatsapp_bot_inbound', column: 'received_at', value: '2026-11-09T15:00:00.000Z' },
    ]);
  });

  it('throws when a delete fails', async () => {
    await expect(purgeWhatsappBotData({ supabaseAdmin: fakeSupabase({ error: { message: 'boom' } }), now: () => NOW }))
      .rejects.toThrow('boom');
  });
});

describe('startWhatsappBotRetentionJob', () => {
  afterEach(() => vi.useRealTimers());

  it('runs once at start and then every 24 hours, and logs failures without throwing', async () => {
    vi.useFakeTimers();
    const sb = fakeSupabase({ error: { message: 'down' } });
    const log = { error: vi.fn() };
    const job = startWhatsappBotRetentionJob({ supabaseAdmin: sb, log });
    await vi.advanceTimersByTimeAsync(0);
    expect(sb.calls.length).toBe(1);
    expect(log.error).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(24 * 60 * 60 * 1000);
    expect(sb.calls.length).toBe(2);
    job.stop();
  });
});

describe('server.js wiring', () => {
  const src = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../../server.js'), 'utf8');

  it('starts the retention job only when the bot is on', () => {
    expect(src).toMatch(/if \(whatsappBot\) \{\s*startWhatsappBotRetentionJob\(\{ supabaseAdmin \}\);/);
  });

  it('does not let an invalid BOT_LLM_PROVIDER stop the server', () => {
    expect(src).toMatch(/try \{\s*botLlm = createBotLlm\(/);
  });
});

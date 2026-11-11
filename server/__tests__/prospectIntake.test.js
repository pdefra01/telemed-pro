import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { runProspectIntake, startProspectIntakeJob, PROSPECT_INTAKE_INTERVAL_MS } from '../prospectIntake.js';

const quietLogger = () => ({ log: vi.fn(), error: vi.fn() });

const adminWith = (rpcResult) => ({ rpc: vi.fn().mockResolvedValue(rpcResult) });

describe('runProspectIntake', () => {
  it('calls the database function and reports what it did', async () => {
    const admin = adminWith({ data: [{ prospects_created: 2, prospects_interested: 1, prospects_converted: 3 }], error: null });
    const logger = quietLogger();

    const result = await runProspectIntake({ supabaseAdmin: admin, logger });

    expect(admin.rpc).toHaveBeenCalledWith('sync_prospects_intake');
    expect(result).toEqual({ ok: true, created: 2, interested: 1, converted: 3 });
    expect(logger.log).toHaveBeenCalledWith(expect.stringContaining('created=2'));
  });

  it('accepts a single object result as well as a one-row array, and string numbers', async () => {
    const admin = adminWith({ data: { prospects_created: '4', prospects_interested: '0', prospects_converted: '0' }, error: null });
    expect(await runProspectIntake({ supabaseAdmin: admin, logger: quietLogger() })).toEqual({ ok: true, created: 4, interested: 0, converted: 0 });
  });

  it('stays quiet when nothing changed', async () => {
    const admin = adminWith({ data: [{ prospects_created: 0, prospects_interested: 0, prospects_converted: 0 }], error: null });
    const logger = quietLogger();

    expect(await runProspectIntake({ supabaseAdmin: admin, logger })).toEqual({ ok: true, created: 0, interested: 0, converted: 0 });
    expect(logger.log).not.toHaveBeenCalled();
  });

  it('treats an empty result as nothing done', async () => {
    const result = await runProspectIntake({ supabaseAdmin: adminWith({ data: null, error: null }), logger: quietLogger() });
    expect(result).toEqual({ ok: true, created: 0, interested: 0, converted: 0 });
  });

  it('reports a database error instead of throwing', async () => {
    const logger = quietLogger();
    const result = await runProspectIntake({ supabaseAdmin: adminWith({ data: null, error: new Error('db down') }), logger });

    expect(result).toEqual({ ok: false, error: 'db down' });
    expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('[prospect-intake]'), 'db down');
  });

  it('reports a thrown error instead of throwing', async () => {
    const admin = { rpc: vi.fn().mockRejectedValue(new Error('network')) };
    expect(await runProspectIntake({ supabaseAdmin: admin, logger: quietLogger() })).toEqual({ ok: false, error: 'network' });
  });
});

describe('startProspectIntakeJob', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  const rpcOk = () => ({ data: [{ prospects_created: 0, prospects_interested: 0, prospects_converted: 0 }], error: null });

  it('runs once right away and then every interval', async () => {
    const admin = { rpc: vi.fn().mockResolvedValue(rpcOk()) };
    const job = startProspectIntakeJob({ supabaseAdmin: admin, intervalMs: 1000, logger: quietLogger() });

    await vi.advanceTimersByTimeAsync(0);
    expect(admin.rpc).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1000);
    expect(admin.rpc).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(2000);
    expect(admin.rpc).toHaveBeenCalledTimes(4);

    job.stop();
    await vi.advanceTimersByTimeAsync(5000);
    expect(admin.rpc).toHaveBeenCalledTimes(4);
  });

  it('defaults to a ten minute interval', () => {
    expect(PROSPECT_INTAKE_INTERVAL_MS).toBe(10 * 60 * 1000);
  });

  it('does not start a run while the previous one is still going', async () => {
    let release;
    const admin = { rpc: vi.fn(() => new Promise((resolveRpc) => { release = () => resolveRpc(rpcOk()); })) };
    const job = startProspectIntakeJob({ supabaseAdmin: admin, intervalMs: 1000, logger: quietLogger() });

    await vi.advanceTimersByTimeAsync(3500);
    expect(admin.rpc).toHaveBeenCalledTimes(1);

    release();
    await vi.advanceTimersByTimeAsync(1000);
    expect(admin.rpc).toHaveBeenCalledTimes(2);
    job.stop();
  });

  it('keeps running after a failed run', async () => {
    const admin = { rpc: vi.fn().mockRejectedValueOnce(new Error('boom')).mockResolvedValue(rpcOk()) };
    const job = startProspectIntakeJob({ supabaseAdmin: admin, intervalMs: 1000, logger: quietLogger() });

    await vi.advanceTimersByTimeAsync(2100);
    expect(admin.rpc).toHaveBeenCalledTimes(3);
    job.stop();
  });

  it('does nothing without a service client', () => {
    const job = startProspectIntakeJob({ supabaseAdmin: null, logger: quietLogger() });
    expect(job.skipped).toBe(true);
    expect(() => job.stop()).not.toThrow();
  });
});

describe('server wiring', () => {
  it('server.js starts the intake job with the service client', () => {
    const source = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../../server.js'), 'utf8');
    expect(source).toMatch(/startProspectIntakeJob\(\s*\{\s*supabaseAdmin\s*\}\s*\)/);
  });
});

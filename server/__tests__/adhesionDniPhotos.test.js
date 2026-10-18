import { describe, it, expect, vi } from 'vitest';

import {
  createDniUploadUrls,
  cleanupOrphanDniPhotos,
  DNI_PHOTOS_BUCKET,
  ORPHAN_MIN_AGE_MS,
} from '../adhesionDniPhotos.js';

const ID = '0f8fad5b-d9cb-469f-a165-70867728950e';
const NOW = new Date('2026-10-18T12:00:00.000Z');
const OLD = new Date(NOW.getTime() - ORPHAN_MIN_AGE_MS - 1000).toISOString();
const RECENT = new Date(NOW.getTime() - 60 * 1000).toISOString();

function buildSigningAdmin({ error = null } = {}) {
  const createSignedUploadUrl = vi.fn(async (path) =>
    error ? { data: null, error } : { data: { path, token: `tok:${path}`, signedUrl: `https://s/${path}` }, error: null }
  );
  const from = vi.fn(() => ({ createSignedUploadUrl }));
  return { supabaseAdmin: { storage: { from } }, from, createSignedUploadUrl };
}

describe('createDniUploadUrls', () => {
  it('reserves an id and signs one upload URL per side under it', async () => {
    const { supabaseAdmin, from, createSignedUploadUrl } = buildSigningAdmin();

    const result = await createDniUploadUrls({ supabaseAdmin, generateId: () => ID }, { front: 'jpg', back: 'png' });

    expect(result).toEqual({
      status: 200,
      body: {
        adhesionRequestId: ID,
        front: { path: `${ID}/front.jpg`, token: `tok:${ID}/front.jpg` },
        back: { path: `${ID}/back.png`, token: `tok:${ID}/back.png` },
      },
    });
    expect(from).toHaveBeenCalledWith(DNI_PHOTOS_BUCKET);
    expect(createSignedUploadUrl).toHaveBeenCalledTimes(2);
  });

  it.each([
    [{ front: 'jpg' }],
    [{ front: 'gif', back: 'jpg' }],
    [{ front: 'jpg', back: '../x' }],
    [undefined],
  ])('rejects %j with 400 and signs nothing', async (body) => {
    const { supabaseAdmin, createSignedUploadUrl } = buildSigningAdmin();

    const result = await createDniUploadUrls({ supabaseAdmin }, body);

    expect(result.status).toBe(400);
    expect(result.body.error).toBe('Las fotos del DNI deben ser imágenes JPG, PNG o WEBP.');
    expect(createSignedUploadUrl).not.toHaveBeenCalled();
  });

  it('answers 503 without a service-role client', async () => {
    expect((await createDniUploadUrls({ supabaseAdmin: null }, { front: 'jpg', back: 'jpg' })).status).toBe(503);
  });

  it('answers 502 when signing fails', async () => {
    const { supabaseAdmin } = buildSigningAdmin({ error: { message: 'boom' } });
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const result = await createDniUploadUrls({ supabaseAdmin }, { front: 'jpg', back: 'jpg' });

    expect(result).toEqual({ status: 502, body: { error: 'No se pudieron preparar las fotos del DNI. Reintentá.' } });
  });
});

/**
 * In-memory bucket: `folders` maps folder id -> files ({ name, created_at });
 * `rowIds` are the adhesion_requests ids that exist.
 */
function buildCleanupAdmin(folders, rowIds) {
  const store = new Map(Object.entries(folders));
  const remove = vi.fn(async (paths) => {
    for (const path of paths) {
      const [folder, name] = path.split('/');
      const left = (store.get(folder) || []).filter((file) => file.name !== name);
      if (left.length) store.set(folder, left);
      else store.delete(folder);
    }
    return { data: [], error: null };
  });
  const list = vi.fn(async (prefix, { limit = 100, offset = 0 } = {}) => {
    if (prefix === '') {
      const names = [...store.keys()].sort().slice(offset, offset + limit);
      return { data: names.map((name) => ({ name, id: null })), error: null };
    }
    return { data: store.get(prefix) || [], error: null };
  });
  const inIds = vi.fn(async (_column, ids) => ({
    data: ids.filter((id) => rowIds.includes(id)).map((id) => ({ id })),
    error: null,
  }));
  const supabaseAdmin = {
    storage: { from: () => ({ list, remove }) },
    from: vi.fn(() => ({ select: () => ({ in: inIds }) })),
  };
  return { supabaseAdmin, store, remove };
}

const photos = (createdAt) => [
  { name: 'front.jpg', created_at: createdAt },
  { name: 'back.jpg', created_at: createdAt },
];

describe('cleanupOrphanDniPhotos', () => {
  it('removes old folders without a row and keeps linked or recent ones', async () => {
    const { supabaseAdmin, store } = buildCleanupAdmin(
      { 'orphan-old': photos(OLD), 'orphan-recent': photos(RECENT), linked: photos(OLD) },
      ['linked']
    );

    const { removed } = await cleanupOrphanDniPhotos({ supabaseAdmin }, { now: NOW });

    expect(removed).toEqual(['orphan-old/front.jpg', 'orphan-old/back.jpg']);
    expect([...store.keys()].sort()).toEqual(['linked', 'orphan-recent']);
  });

  it('keeps a folder when any file in it is still recent', async () => {
    const { supabaseAdmin, remove } = buildCleanupAdmin(
      { half: [{ name: 'front.jpg', created_at: OLD }, { name: 'back.jpg', created_at: RECENT }] },
      []
    );

    expect((await cleanupOrphanDniPhotos({ supabaseAdmin }, { now: NOW })).removed).toEqual([]);
    expect(remove).not.toHaveBeenCalled();
  });

  it('reaches every page even while removing folders from earlier pages', async () => {
    const folders = {};
    for (let i = 0; i < 250; i += 1) folders[`f${String(i).padStart(3, '0')}`] = photos(OLD);
    const keep = ['f010', 'f150', 'f249'];
    const { supabaseAdmin, store } = buildCleanupAdmin(folders, keep);

    const { removed } = await cleanupOrphanDniPhotos({ supabaseAdmin }, { now: NOW });

    expect(removed).toHaveLength((250 - keep.length) * 2);
    expect([...store.keys()].sort()).toEqual(keep);
  });

  it('propagates storage errors', async () => {
    const supabaseAdmin = {
      storage: { from: () => ({ list: async () => ({ data: null, error: new Error('list failed') }) }) },
    };

    await expect(cleanupOrphanDniPhotos({ supabaseAdmin }, { now: NOW })).rejects.toThrow('list failed');
  });
});

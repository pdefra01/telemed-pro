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

/** Deterministic folder ids: the sweep only considers `<uuid>/` folders. */
const uuid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

/**
 * In-memory bucket: `folders` maps folder name -> entries ({ name, id,
 * created_at }); `rowIds` are the adhesion_requests ids that exist.
 * `failingFolders` make list(folder) return an error.
 */
function buildCleanupAdmin(folders, rowIds, { failingFolders = [] } = {}) {
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
    if (failingFolders.includes(prefix)) return { data: null, error: new Error(`list ${prefix} failed`) };
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
  return { supabaseAdmin, store, remove, inIds };
}

const photos = (createdAt) => [
  { name: 'front.jpg', id: 'obj-front', created_at: createdAt },
  { name: 'back.jpg', id: 'obj-back', created_at: createdAt },
];

describe('cleanupOrphanDniPhotos', () => {
  it('removes old folders without a row and keeps linked or recent ones', async () => {
    const [orphanOld, orphanRecent, linked] = [uuid(1), uuid(2), uuid(3)];
    const { supabaseAdmin, store } = buildCleanupAdmin(
      { [orphanOld]: photos(OLD), [orphanRecent]: photos(RECENT), [linked]: photos(OLD) },
      [linked]
    );

    const result = await cleanupOrphanDniPhotos({ supabaseAdmin }, { now: NOW });

    expect(result).toEqual({ removed: [`${orphanOld}/front.jpg`, `${orphanOld}/back.jpg`], failed: [] });
    expect([...store.keys()].sort()).toEqual([orphanRecent, linked].sort());
  });

  it('keeps a folder when any file in it is still recent', async () => {
    const { supabaseAdmin, remove } = buildCleanupAdmin(
      { [uuid(1)]: [{ name: 'front.jpg', id: 'a', created_at: OLD }, { name: 'back.jpg', id: 'b', created_at: RECENT }] },
      []
    );

    expect((await cleanupOrphanDniPhotos({ supabaseAdmin }, { now: NOW })).removed).toEqual([]);
    expect(remove).not.toHaveBeenCalled();
  });

  it('reaches every page even while removing folders from earlier pages', async () => {
    const folders = {};
    for (let i = 0; i < 250; i += 1) folders[uuid(i)] = photos(OLD);
    const keep = [uuid(10), uuid(150), uuid(249)];
    const { supabaseAdmin, store } = buildCleanupAdmin(folders, keep);

    const { removed } = await cleanupOrphanDniPhotos({ supabaseAdmin }, { now: NOW });

    expect(removed).toHaveLength((250 - keep.length) * 2);
    expect([...store.keys()].sort()).toEqual(keep);
  });

  it('ignores non-uuid root entries without querying them or blocking the sweep', async () => {
    const orphan = uuid(7);
    const { supabaseAdmin, store, inIds } = buildCleanupAdmin(
      { 'manual-upload.png': [], 'zz-notes': photos(OLD), [orphan]: photos(OLD) },
      []
    );

    const { removed } = await cleanupOrphanDniPhotos({ supabaseAdmin }, { now: NOW });

    expect(removed).toEqual([`${orphan}/front.jpg`, `${orphan}/back.jpg`]);
    expect(inIds).toHaveBeenCalledWith('id', [orphan]);
    expect([...store.keys()].sort()).toEqual(['manual-upload.png', 'zz-notes']);
  });

  it('skips a failing folder and still cleans the ones after it', async () => {
    const [broken, orphan] = [uuid(1), uuid(2)];
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { supabaseAdmin, store } = buildCleanupAdmin(
      { [broken]: photos(OLD), [orphan]: photos(OLD) },
      [],
      { failingFolders: [broken] }
    );

    const result = await cleanupOrphanDniPhotos({ supabaseAdmin }, { now: NOW });

    expect(result).toEqual({ removed: [`${orphan}/front.jpg`, `${orphan}/back.jpg`], failed: [broken] });
    expect([...store.keys()]).toEqual([broken]);
  });

  it('leaves a folder that contains a nested folder untouched', async () => {
    const { supabaseAdmin, remove } = buildCleanupAdmin(
      { [uuid(1)]: [...photos(OLD), { name: 'nested', id: null, created_at: null }] },
      []
    );

    expect((await cleanupOrphanDniPhotos({ supabaseAdmin }, { now: NOW })).removed).toEqual([]);
    expect(remove).not.toHaveBeenCalled();
  });

  it('propagates a root listing error so the next run retries', async () => {
    const supabaseAdmin = {
      storage: { from: () => ({ list: async () => ({ data: null, error: new Error('list failed') }) }) },
    };

    await expect(cleanupOrphanDniPhotos({ supabaseAdmin }, { now: NOW })).rejects.toThrow('list failed');
  });
});

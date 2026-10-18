// server/adhesionDniPhotos.js
//
// Titular DNI photos for the public adhesion form. The bucket is private and
// has no anon policy at all: the browser can only upload through one-time
// signed upload URLs issued here (rate-limited per IP in server.js), and a
// periodic job removes folders that never got an adhesion_requests row.
// See supabase/migrations/20261018000000_adhesion_dni_photos.sql.

import { randomUUID } from 'node:crypto';

export const DNI_PHOTOS_BUCKET = 'adhesion-documents';
export const DNI_PHOTO_EXTENSIONS = Object.freeze(['jpg', 'png', 'webp']);

/** Folders without a row are deleted once every file in them is this old. */
export const ORPHAN_MIN_AGE_MS = 24 * 60 * 60 * 1000;
export const ORPHAN_CLEANUP_INTERVAL_MS = 60 * 60 * 1000;
const LIST_PAGE_SIZE = 100;

/**
 * POST /api/adhesion/dni-upload-urls
 * Body: { front: 'jpg'|'png'|'webp', back: 'jpg'|'png'|'webp' }
 * Reserves a new adhesion request id and returns one signed upload URL per
 * side under `<id>/(front|back).<ext>`. The id is the one the form must use
 * for the row insert (the DB trigger checks the paths sit under it).
 *
 * @returns {Promise<{ status: number, body: object }>}
 */
export async function createDniUploadUrls({ supabaseAdmin, generateId = randomUUID }, body) {
  if (!supabaseAdmin) {
    return { status: 503, body: { error: 'Servicio no disponible.' } };
  }
  const front = body?.front;
  const back = body?.back;
  if (!DNI_PHOTO_EXTENSIONS.includes(front) || !DNI_PHOTO_EXTENSIONS.includes(back)) {
    return { status: 400, body: { error: 'Las fotos del DNI deben ser imágenes JPG, PNG o WEBP.' } };
  }

  const adhesionRequestId = generateId();
  const bucket = supabaseAdmin.storage.from(DNI_PHOTOS_BUCKET);
  const sign = async (side, ext) => {
    const path = `${adhesionRequestId}/${side}.${ext}`;
    const { data, error } = await bucket.createSignedUploadUrl(path);
    if (error || !data?.token) throw error || new Error('missing upload token');
    return { path, token: data.token };
  };

  try {
    const [frontUpload, backUpload] = await Promise.all([sign('front', front), sign('back', back)]);
    return { status: 200, body: { adhesionRequestId, front: frontUpload, back: backUpload } };
  } catch (err) {
    console.error('[adhesionDniPhotos] createSignedUploadUrl failed:', err?.message || err);
    return { status: 502, body: { error: 'No se pudieron preparar las fotos del DNI. Reintentá.' } };
  }
}

/**
 * Deletes DNI photo folders that have no adhesion_requests row (failed
 * submits, abandoned forms, requests deleted by an admin) once every file in
 * the folder is older than `minAgeMs`, so an in-flight submission is never
 * touched. Only `<uuid>/` folders holding plain files are considered: any
 * other root entry (e.g. something uploaded by hand) is left alone, and a
 * folder that fails is logged and skipped so it never blocks the rest.
 *
 * @returns {Promise<{ removed: string[], failed: string[] }>} removed object
 *   paths, and folder ids that errored this run
 */
export async function cleanupOrphanDniPhotos({ supabaseAdmin }, { now = new Date(), minAgeMs = ORPHAN_MIN_AGE_MS } = {}) {
  const bucket = supabaseAdmin.storage.from(DNI_PHOTOS_BUCKET);
  const removed = [];
  const failed = [];

  // Removed folders vanish from the listing, so the next page starts after
  // the folders that were kept, not after a full page.
  for (let offset = 0; ;) {
    const { data: entries, error: listError } = await bucket.list('', { limit: LIST_PAGE_SIZE, offset });
    if (listError) throw listError;
    if (!entries?.length) break;

    const folderIds = entries.map((entry) => entry.name).filter((name) => UUID_PATTERN.test(name));
    const linked = new Set();
    if (folderIds.length) {
      const { data: rows, error: rowsError } = await supabaseAdmin
        .from('adhesion_requests')
        .select('id')
        .in('id', folderIds);
      if (rowsError) throw rowsError;
      for (const row of rows || []) linked.add(row.id);
    }

    let removedFolders = 0;
    for (const folderId of folderIds) {
      if (linked.has(folderId)) continue;
      try {
        if (await removeOrphanFolder(bucket, folderId, now, minAgeMs, removed)) removedFolders += 1;
      } catch (err) {
        console.error(`[adhesionDniPhotos] Skipping folder ${folderId}:`, err?.message || err);
        failed.push(folderId);
      }
    }

    if (entries.length < LIST_PAGE_SIZE) break;
    offset += entries.length - removedFolders;
  }

  return { removed, failed };
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** @returns {Promise<boolean>} whether the folder was emptied */
async function removeOrphanFolder(bucket, folderId, now, minAgeMs, removed) {
  const { data: files, error: filesError } = await bucket.list(folderId);
  if (filesError) throw filesError;
  // Nested folders come back with a null id; that is not a layout we write.
  if (!files?.length || files.some((file) => !file.id)) return false;
  const allOld = files.every((file) => now.getTime() - new Date(file.created_at).getTime() >= minAgeMs);
  if (!allOld) return false;

  const paths = files.map((file) => `${folderId}/${file.name}`);
  const { error: removeError } = await bucket.remove(paths);
  if (removeError) throw removeError;
  removed.push(...paths);
  return true;
}

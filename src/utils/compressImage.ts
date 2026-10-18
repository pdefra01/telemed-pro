const MAX_DIMENSION = 1600;
const JPEG_QUALITY = 0.85;

/**
 * Downscales a phone photo to at most `maxDimension` px on its longest side
 * and re-encodes it as JPEG, so a 5-8 MB camera shot uploads as a few hundred
 * KB. Any failure (no canvas support, undecodable format) returns the
 * original file untouched: the caller still validates its type.
 */
export async function compressImage(file: Blob, maxDimension = MAX_DIMENSION, quality = JPEG_QUALITY): Promise<Blob> {
  try {
    if (typeof createImageBitmap !== 'function') return file;
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
    const width = Math.round(bitmap.width * scale);
    const height = Math.round(bitmap.height * scale);

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) return file;
    context.drawImage(bitmap, 0, 0, width, height);
    bitmap.close?.();

    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
    return blob ?? file;
  } catch (err) {
    console.warn('[compressImage] Keeping the original file.', err);
    return file;
  }
}

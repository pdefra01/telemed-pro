import { describe, it, expect, vi, afterEach } from 'vitest';
import { compressImage } from '../compressImage';

describe('compressImage', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('returns the original file when the browser cannot decode images', async () => {
    vi.stubGlobal('createImageBitmap', undefined);
    const file = new File(['raw'], 'dni.heic', { type: 'image/heic' });

    expect(await compressImage(file)).toBe(file);
  });

  it('scales the longest side down to the limit and re-encodes as JPEG', async () => {
    vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue({ width: 4000, height: 3000, close: vi.fn() }));
    const drawImage = vi.fn();
    const jpeg = new Blob(['jpeg'], { type: 'image/jpeg' });
    const canvas = {
      width: 0,
      height: 0,
      getContext: () => ({ drawImage }),
      toBlob: (cb: (b: Blob | null) => void, type: string, quality: number) => {
        expect(type).toBe('image/jpeg');
        expect(quality).toBe(0.85);
        cb(jpeg);
      }
    };
    vi.spyOn(document, 'createElement').mockReturnValue(canvas as any);

    const result = await compressImage(new File(['raw'], 'dni.jpg', { type: 'image/jpeg' }));

    expect(result).toBe(jpeg);
    expect(canvas.width).toBe(1600);
    expect(canvas.height).toBe(1200);
    expect(drawImage).toHaveBeenCalledWith(expect.anything(), 0, 0, 1600, 1200);
  });

  it('returns the original file when decoding throws', async () => {
    vi.stubGlobal('createImageBitmap', vi.fn().mockRejectedValue(new Error('bad image')));
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const file = new File(['raw'], 'dni.jpg', { type: 'image/jpeg' });

    expect(await compressImage(file)).toBe(file);
  });
});

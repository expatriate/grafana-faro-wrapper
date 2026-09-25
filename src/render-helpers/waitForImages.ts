import { isSvgSource } from './isSvgSource.ts';
import { withTimeout } from './withTimeout.ts';

export const DEFAULT_IMAGE_TIMEOUT_MS = 10_000;

async function waitForImage(image: HTMLImageElement, timeoutMs: number): Promise<boolean> {
  const src = image.currentSrc || image.src;
  if (!src) {
    return false;
  }
  try {
    await withTimeout(image.decode(), timeoutMs);
    return image.naturalWidth > 0 || isSvgSource(src);
  } catch {
    return false;
  }
}

export async function waitForImages(
  images: HTMLImageElement[],
  timeoutMs: number,
): Promise<boolean> {
  if (images.length === 0) {
    return false;
  }
  const results = await Promise.all(images.map((image) => waitForImage(image, timeoutMs)));
  return results.every(Boolean);
}

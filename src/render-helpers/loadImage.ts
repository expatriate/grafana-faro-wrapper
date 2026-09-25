import { isSvgSource } from './isSvgSource.ts';
import { DEFAULT_IMAGE_TIMEOUT_MS } from './waitForImages.ts';
import { withTimeout } from './withTimeout.ts';

export async function loadImage(
  src: string,
  timeoutMs = DEFAULT_IMAGE_TIMEOUT_MS,
): Promise<boolean> {
  const image = new Image();
  const loaded = new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error(`failed to load ${src}`));
  });
  image.src = src;
  try {
    await withTimeout(loaded, timeoutMs);
    return image.naturalWidth > 0 || isSvgSource(src);
  } catch {
    return false;
  }
}

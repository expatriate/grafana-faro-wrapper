import { hasVisiblePixels } from './imageRules';
import { DEFAULT_IMAGE_TIMEOUT_MS } from './waitForImages';
import { withTimeout } from './withTimeout';

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
    return hasVisiblePixels(image, src);
  } catch {
    return false;
  }
}

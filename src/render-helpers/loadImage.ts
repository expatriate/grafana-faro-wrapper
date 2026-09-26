import { DEFAULT_IMAGE_TIMEOUT_MS } from './waitForImages';
import { isVisibleOnceLoaded } from './imageRules';

export function loadImage(src: string, timeoutMs = DEFAULT_IMAGE_TIMEOUT_MS): Promise<boolean> {
  const image = new Image();
  const loading = new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error(`failed to load ${src}`));
  });
  image.src = src;
  return isVisibleOnceLoaded(image, src, () => loading, timeoutMs);
}

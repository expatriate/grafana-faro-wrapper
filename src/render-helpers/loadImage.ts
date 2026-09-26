import { isImageLoaded } from './imageRules';
import { DEFAULT_IMAGE_TIMEOUT_MS } from './waitForImages';

export function loadImage(src: string, timeoutMs = DEFAULT_IMAGE_TIMEOUT_MS): Promise<boolean> {
  const image = new Image();
  image.src = src;
  return isImageLoaded(image, timeoutMs);
}

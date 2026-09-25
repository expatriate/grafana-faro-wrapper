import { allDisplayed, hasVisiblePixels, imageSource } from './imageRules.ts';
import { withTimeout } from './withTimeout.ts';

export const DEFAULT_IMAGE_TIMEOUT_MS = 10_000;

async function waitForImage(image: HTMLImageElement, timeoutMs: number): Promise<boolean> {
  const src = imageSource(image);
  if (!src) {
    return false;
  }
  try {
    await withTimeout(image.decode(), timeoutMs);
    return hasVisiblePixels(image, src);
  } catch {
    return false;
  }
}

export function waitForImages(images: HTMLImageElement[], timeoutMs: number): Promise<boolean> {
  return allDisplayed(images, (image) => waitForImage(image, timeoutMs));
}

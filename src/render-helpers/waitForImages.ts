import { allDisplayed, imageSource, isVisibleOnceLoaded } from './imageRules';

export const DEFAULT_IMAGE_TIMEOUT_MS = 10_000;

function waitForImage(image: HTMLImageElement, timeoutMs: number): Promise<boolean> {
  const src = imageSource(image);
  if (!src) {
    return Promise.resolve(false);
  }
  if (image.complete && image.naturalWidth > 0) {
    return Promise.resolve(true);
  }
  return isVisibleOnceLoaded(image, src, () => image.decode(), timeoutMs);
}

export function waitForImages(images: HTMLImageElement[], timeoutMs: number): Promise<boolean> {
  return allDisplayed(images, (image) => waitForImage(image, timeoutMs));
}

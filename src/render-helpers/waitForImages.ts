import { allDisplayed, hasSource, isImageLoaded } from './imageRules';

export const DEFAULT_IMAGE_TIMEOUT_MS = 10_000;

export function waitForImages(images: HTMLImageElement[], timeoutMs: number): Promise<boolean> {
  return allDisplayed(images, (image) =>
    hasSource(image) ? isImageLoaded(image, timeoutMs) : Promise.resolve(false),
  );
}

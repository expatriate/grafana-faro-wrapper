import { allDisplayed, failStepIfSourceMissing, isImageLoaded } from './imageRules';

export const DEFAULT_IMAGE_TIMEOUT_MS = 10_000;

export function waitForImages(images: HTMLImageElement[], timeoutMs: number): Promise<boolean> {
  if (failStepIfSourceMissing(images)) {
    return Promise.resolve(false);
  }
  return allDisplayed(images, (image) => isImageLoaded(image, timeoutMs));
}

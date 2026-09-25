import { DEFAULT_IMAGE_TIMEOUT_MS, waitForImages } from './waitForImages';

export function asyncCheckImagesIsDisplayed(
  selector: string,
  timeoutMs = DEFAULT_IMAGE_TIMEOUT_MS,
): Promise<boolean> {
  return waitForImages(
    Array.from(document.querySelectorAll<HTMLImageElement>(selector)),
    timeoutMs,
  );
}

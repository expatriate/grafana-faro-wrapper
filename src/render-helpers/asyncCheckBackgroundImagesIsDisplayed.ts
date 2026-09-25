import { extractBackgroundUrl } from './extractBackgroundUrl';
import { allDisplayed } from './imageRules';
import { loadImage } from './loadImage';
import { DEFAULT_IMAGE_TIMEOUT_MS, waitForImages } from './waitForImages';

function isElementImageDisplayed(element: Element, timeoutMs: number): Promise<boolean> {
  const images =
    element instanceof HTMLImageElement ? [element] : Array.from(element.querySelectorAll('img'));
  if (images.length > 0) {
    return waitForImages(images, timeoutMs);
  }
  const url = extractBackgroundUrl(element);
  return url ? loadImage(url, timeoutMs) : Promise.resolve(false);
}

export function asyncCheckBackgroundImagesIsDisplayed(
  selector: string,
  timeoutMs = DEFAULT_IMAGE_TIMEOUT_MS,
): Promise<boolean> {
  return allDisplayed(Array.from(document.querySelectorAll(selector)), (element) =>
    isElementImageDisplayed(element, timeoutMs),
  );
}

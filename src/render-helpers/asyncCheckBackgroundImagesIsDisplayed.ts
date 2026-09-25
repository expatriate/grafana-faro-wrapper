import { extractBackgroundUrl } from './extractBackgroundUrl.ts';
import { loadImage } from './loadImage.ts';
import { DEFAULT_IMAGE_TIMEOUT_MS, waitForImages } from './waitForImages.ts';

function isElementImageDisplayed(element: Element, timeoutMs: number): Promise<boolean> {
  const images =
    element instanceof HTMLImageElement ? [element] : Array.from(element.querySelectorAll('img'));
  if (images.length > 0) {
    return waitForImages(images, timeoutMs);
  }
  const url = extractBackgroundUrl(element);
  return url ? loadImage(url, timeoutMs) : Promise.resolve(false);
}

export async function asyncCheckBackgroundImagesIsDisplayed(
  selector: string,
  timeoutMs = DEFAULT_IMAGE_TIMEOUT_MS,
): Promise<boolean> {
  const elements = Array.from(document.querySelectorAll(selector));
  if (elements.length === 0) {
    return false;
  }
  const results = await Promise.all(
    elements.map((element) => isElementImageDisplayed(element, timeoutMs)),
  );
  return results.every(Boolean);
}

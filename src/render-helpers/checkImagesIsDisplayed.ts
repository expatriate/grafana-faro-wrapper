import { queryAll } from '../utils/safeQuery';
import { hasVisiblePixels, imageSource, imagesOf } from './imageRules';

function isElementImageLoaded(element: Element): boolean {
  const images = imagesOf(element);
  return (
    images.length > 0 &&
    images.every((image) => image.complete && hasVisiblePixels(image, imageSource(image)))
  );
}

export function checkImagesIsDisplayed(selector: string): boolean {
  const elements = queryAll(selector);
  return elements.length > 0 && elements.every(isElementImageLoaded);
}

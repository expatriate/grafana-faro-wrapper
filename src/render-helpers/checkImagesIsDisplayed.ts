import { hasVisiblePixels, imageSource } from './imageRules.ts';

export function checkImagesIsDisplayed(selector: string): boolean {
  const images = Array.from(document.querySelectorAll<HTMLImageElement>(selector));
  return (
    images.length > 0 &&
    images.every((image) => image.complete && hasVisiblePixels(image, imageSource(image)))
  );
}

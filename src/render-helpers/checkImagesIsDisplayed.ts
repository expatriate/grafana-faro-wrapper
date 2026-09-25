import { isSvgSource } from './isSvgSource.ts';

export function checkImagesIsDisplayed(selector: string): boolean {
  const images = Array.from(document.querySelectorAll<HTMLImageElement>(selector));
  return (
    images.length > 0 &&
    images.every(
      (image) =>
        image.complete && (image.naturalWidth > 0 || isSvgSource(image.currentSrc || image.src)),
    )
  );
}

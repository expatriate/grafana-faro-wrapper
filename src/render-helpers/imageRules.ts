import { withTimeout } from './withTimeout';

export function isSvgSource(src: string): boolean {
  return /\.svg([?#]|$)/i.test(src) || src.startsWith('data:image/svg');
}

export function imageSource(image: HTMLImageElement): string {
  return image.currentSrc || image.src;
}

export function hasVisiblePixels(image: HTMLImageElement, src: string): boolean {
  return image.naturalWidth > 0 || isSvgSource(src);
}

export function imagesOf(element: Element): HTMLImageElement[] {
  return element instanceof HTMLImageElement
    ? [element]
    : Array.from(element.querySelectorAll('img'));
}

export async function allDisplayed<T>(
  items: T[],
  isDisplayed: (item: T) => Promise<boolean>,
): Promise<boolean> {
  if (items.length === 0) {
    return false;
  }
  const results = await Promise.all(items.map(isDisplayed));
  return results.every(Boolean);
}

export async function isVisibleOnceLoaded(
  image: HTMLImageElement,
  src: string,
  load: () => Promise<void>,
  timeoutMs: number,
): Promise<boolean> {
  try {
    await withTimeout(load(), timeoutMs);
    return hasVisiblePixels(image, src);
  } catch {
    return false;
  }
}

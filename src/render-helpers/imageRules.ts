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

export function hasSource(image: HTMLImageElement): boolean {
  return (
    Boolean(image.getAttribute('src') || image.getAttribute('srcset')) ||
    image.parentElement instanceof HTMLPictureElement
  );
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

function settled(image: HTMLImageElement, timeoutMs: number): Promise<void> {
  if (image.complete) {
    return Promise.resolve();
  }
  return new Promise((resolve, reject) => {
    const stopListening = () => {
      clearTimeout(timer);
      image.removeEventListener('load', onSettled);
      image.removeEventListener('error', onSettled);
    };
    const onSettled = () => {
      stopListening();
      resolve();
    };
    const timer = setTimeout(() => {
      stopListening();
      reject(new Error(`timed out after ${timeoutMs} ms`));
    }, timeoutMs);
    image.addEventListener('load', onSettled);
    image.addEventListener('error', onSettled);
  });
}

export async function isImageLoaded(image: HTMLImageElement, timeoutMs: number): Promise<boolean> {
  const startedAt = Date.now();
  try {
    await settled(image, timeoutMs);
    if (image.naturalWidth > 0) {
      return true;
    }
    await withTimeout(image.decode(), Math.max(0, timeoutMs - (Date.now() - startedAt)));
    return true;
  } catch {
    return false;
  }
}

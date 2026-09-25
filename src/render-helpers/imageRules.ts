export function isSvgSource(src: string): boolean {
  return /\.svg([?#]|$)/i.test(src) || src.startsWith('data:image/svg');
}

export const imageSource = (image: HTMLImageElement) => image.currentSrc || image.src;

export const hasVisiblePixels = (image: HTMLImageElement, src: string) =>
  image.naturalWidth > 0 || isSvgSource(src);

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

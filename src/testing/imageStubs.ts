export function renderImages(...sources: string[]): HTMLImageElement[] {
  document.body.innerHTML = sources.map((src) => `<img src="${src}">`).join('');
  return Array.from(document.querySelectorAll('img'));
}

type ImageOutcome = { naturalWidth: number } | 'error' | 'pending';

export function stubDecodedImage(
  image: HTMLImageElement,
  {
    naturalWidth = 0,
    decode = Promise.resolve(),
  }: { naturalWidth?: number; decode?: Promise<void> },
) {
  Object.defineProperty(image, 'naturalWidth', { value: naturalWidth });
  Object.defineProperty(image, 'complete', { value: true });
  image.decode = () => decode;
}

export function stubImageLoading(outcomes: Record<string, ImageOutcome>) {
  return jest.spyOn(window, 'Image').mockImplementation(() => {
    const image: any = { naturalWidth: 0 };
    Object.defineProperty(image, 'src', {
      set(src: string) {
        const outcome = outcomes[src] ?? 'error';
        if (outcome === 'pending') return;
        queueMicrotask(() => {
          if (outcome === 'error') {
            image.onerror();
          } else {
            image.naturalWidth = outcome.naturalWidth;
            image.onload();
          }
        });
      },
    });
    return image;
  });
}

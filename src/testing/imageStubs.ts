export function renderImages(...sources: string[]): HTMLImageElement[] {
  document.body.innerHTML = sources.map((src) => `<img src="${src}">`).join('');
  return Array.from(document.querySelectorAll('img'));
}

type ImageOutcome = { naturalWidth: number } | 'error' | 'pending';

export function stubDecodedImage(
  image: HTMLImageElement,
  {
    naturalWidth = 0,
    complete = true,
    decode = Promise.resolve(),
  }: { naturalWidth?: number; complete?: boolean; decode?: Promise<void> },
) {
  Object.defineProperty(image, 'naturalWidth', { value: naturalWidth });
  Object.defineProperty(image, 'complete', { value: complete });
  image.decode = () => decode;
}

export function stubImageLoading(outcomes: Record<string, ImageOutcome>) {
  return jest.spyOn(window, 'Image').mockImplementation(() => {
    const listeners: Record<string, Set<() => void>> = { load: new Set(), error: new Set() };
    let outcome: ImageOutcome = 'pending';
    const image: any = {
      complete: false,
      naturalWidth: 0,
      addEventListener: (type: string, listener: () => void) => listeners[type].add(listener),
      removeEventListener: (type: string, listener: () => void) => listeners[type].delete(listener),
      decode: () =>
        outcome === 'pending'
          ? new Promise(() => {})
          : outcome === 'error'
            ? Promise.reject(new Error('EncodingError'))
            : Promise.resolve(),
    };
    Object.defineProperty(image, 'src', {
      set(src: string) {
        outcome = outcomes[src] ?? 'error';
        if (outcome === 'pending') {
          return;
        }
        const loaded = outcome;
        queueMicrotask(() => {
          image.complete = true;
          if (loaded !== 'error') {
            image.naturalWidth = loaded.naturalWidth;
          }
          listeners[loaded === 'error' ? 'error' : 'load'].forEach((listener) => listener());
        });
      },
    });
    return image;
  });
}

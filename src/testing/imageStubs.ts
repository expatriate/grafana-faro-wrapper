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

const sameUrl = (a: string, b: string) =>
  new URL(a, document.baseURI).href === new URL(b, document.baseURI).href;

export function stubImageLoading(outcomes: Record<string, ImageOutcome | ImageOutcome[]>) {
  const requests = new Map<string, number>();
  const outcomeFor = (src: string): ImageOutcome => {
    const key = Object.keys(outcomes).find((candidate) => sameUrl(candidate, src));
    if (key === undefined) {
      return 'error';
    }
    const attempt = requests.get(key) ?? 0;
    requests.set(key, attempt + 1);
    const planned = [outcomes[key]].flat();
    return planned[Math.min(attempt, planned.length - 1)];
  };
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
        outcome = outcomeFor(src);
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

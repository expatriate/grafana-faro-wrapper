import { asyncCheckImagesIsDisplayed } from './asyncCheckImagesIsDisplayed';
import { renderImages, stubDecodedImage } from '../testing/imageStubs';

afterEach(() => {
  jest.useRealTimers();
});

test('passes when every image decodes with pixels, SVG without intrinsic size included', async () => {
  const [logo, icon] = renderImages('https://a.com/logo.png', 'https://a.com/icon.svg');
  stubDecodedImage(logo, { naturalWidth: 120 });
  stubDecodedImage(icon, { naturalWidth: 0 });

  await expect(asyncCheckImagesIsDisplayed('img')).resolves.toBe(true);
});

test('fails when an image cannot be decoded', async () => {
  const [logo, broken] = renderImages('https://a.com/logo.png', 'https://a.com/broken.png');
  stubDecodedImage(logo, { naturalWidth: 120 });
  stubDecodedImage(broken, { decode: Promise.reject(new Error('EncodingError')) });

  await expect(asyncCheckImagesIsDisplayed('[src*="broken"]')).resolves.toBe(false);
  await expect(asyncCheckImagesIsDisplayed('img')).resolves.toBe(false);
});

test('fails after the timeout when an image never finishes loading', async () => {
  jest.useFakeTimers();
  const [slow] = renderImages('https://a.com/slow.png');
  stubDecodedImage(slow, { decode: new Promise(() => {}) });

  const result = asyncCheckImagesIsDisplayed('img', 500);
  await jest.advanceTimersByTimeAsync(500);

  await expect(result).resolves.toBe(false);
});

test('fails when there are no images or an image has no source', async () => {
  document.body.innerHTML = '<img>';
  stubDecodedImage(document.querySelector('img')!, { naturalWidth: 120 });

  await expect(asyncCheckImagesIsDisplayed('.missing')).resolves.toBe(false);
  await expect(asyncCheckImagesIsDisplayed('img')).resolves.toBe(false);
});

test('checks images inside a wrapper and fails on a wrapper without images', async () => {
  document.body.innerHTML =
    '<picture data-slo="logo"><img src="https://a.com/logo.png"></picture><div data-slo="empty"></div>';
  stubDecodedImage(document.querySelector('img')!, { naturalWidth: 120 });

  await expect(asyncCheckImagesIsDisplayed('[data-slo="logo"]')).resolves.toBe(true);
  await expect(asyncCheckImagesIsDisplayed('[data-slo]')).resolves.toBe(false);
});

test('passes for an already loaded image even when decode never settles, as in a hidden tab', async () => {
  jest.useFakeTimers();
  const [logo] = renderImages('https://a.com/logo.png');
  stubDecodedImage(logo, { naturalWidth: 120, complete: true, decode: new Promise(() => {}) });

  await expect(asyncCheckImagesIsDisplayed('img', 500)).resolves.toBe(true);
});

function stubLoadingImage(image: HTMLImageElement, previousWidth = 0) {
  const state = { complete: false, naturalWidth: previousWidth, failed: false };
  Object.defineProperty(image, 'complete', { get: () => state.complete });
  Object.defineProperty(image, 'naturalWidth', { get: () => state.naturalWidth });
  image.decode = () =>
    state.failed ? Promise.reject(new Error('EncodingError')) : Promise.resolve();
  return (outcome: 'load' | 'error', naturalWidth = 0) => {
    state.complete = true;
    state.naturalWidth = naturalWidth;
    state.failed = outcome === 'error';
    image.dispatchEvent(new Event(outcome));
  };
}

test('waits for an image whose src just changed instead of trusting the previous picture', async () => {
  const [photo] = renderImages('https://a.com/missing.png');
  const finishLoading = stubLoadingImage(photo, 120);

  const result = asyncCheckImagesIsDisplayed('img');
  finishLoading('error');

  await expect(result).resolves.toBe(false);
});

test('waits for a srcset image the browser has not picked a source for yet', async () => {
  document.body.innerHTML =
    '<img srcset="https://a.com/logo.png 1x, https://a.com/logo@2x.png 2x">';
  const finishLoading = stubLoadingImage(document.querySelector('img')!);

  const result = asyncCheckImagesIsDisplayed('img');
  finishLoading('load', 120);

  await expect(result).resolves.toBe(true);
});

test('accepts a loaded SVG without intrinsic size whatever its URL looks like', async () => {
  const [logo] = renderImages('https://a.com/logo?format=svg');
  stubDecodedImage(logo, { naturalWidth: 0 });

  await expect(asyncCheckImagesIsDisplayed('img')).resolves.toBe(true);
});

import { asyncCheckImagesIsDisplayed } from './asyncCheckImagesIsDisplayed.ts';
import { renderImages, stubDecodedImage } from './imageStubs.ts';

afterEach(() => {
  jest.useRealTimers();
});

test('passes when every image decodes with pixels, SVG without intrinsic size included', async () => {
  const [logo, icon] = renderImages('https://a.com/logo.png', 'https://a.com/icon.svg');
  stubDecodedImage(logo, { naturalWidth: 120 });
  stubDecodedImage(icon, { naturalWidth: 0 });

  await expect(asyncCheckImagesIsDisplayed('img')).resolves.toBe(true);
});

test('fails when an image cannot be decoded or decodes empty', async () => {
  const [logo, broken, empty] = renderImages(
    'https://a.com/logo.png',
    'https://a.com/broken.png',
    'https://a.com/empty.png',
  );
  stubDecodedImage(logo, { naturalWidth: 120 });
  stubDecodedImage(broken, { decode: Promise.reject(new Error('EncodingError')) });
  stubDecodedImage(empty, { naturalWidth: 0 });

  await expect(asyncCheckImagesIsDisplayed('[src*="broken"]')).resolves.toBe(false);
  await expect(asyncCheckImagesIsDisplayed('[src*="empty"]')).resolves.toBe(false);
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

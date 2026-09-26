import { stubImageLoading } from '../testing/imageStubs';
import { loadImage } from './loadImage';

afterEach(() => {
  jest.restoreAllMocks();
  jest.useRealTimers();
});

test('passes for a loaded raster image and an SVG without intrinsic size', async () => {
  stubImageLoading({ 'logo.png': { naturalWidth: 120 }, 'icon.svg': { naturalWidth: 0 } });

  await expect(loadImage('logo.png')).resolves.toBe(true);
  await expect(loadImage('icon.svg')).resolves.toBe(true);
});

test('fails for a load error', async () => {
  stubImageLoading({ 'broken.png': 'error' });

  await expect(loadImage('broken.png')).resolves.toBe(false);
});

test('passes for an SVG without intrinsic size served without an .svg extension', async () => {
  stubImageLoading({ '/logo?format=svg': { naturalWidth: 0 } });

  await expect(loadImage('/logo?format=svg')).resolves.toBe(true);
});

test('fails after the timeout when the image never loads', async () => {
  jest.useFakeTimers();
  stubImageLoading({ 'slow.png': 'pending' });

  const result = loadImage('slow.png', 500);
  await jest.advanceTimersByTimeAsync(500);

  await expect(result).resolves.toBe(false);
});

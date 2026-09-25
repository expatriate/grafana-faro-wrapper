import { stubImageLoading } from './imageStubs';
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

test('fails for a load error and an empty raster', async () => {
  stubImageLoading({ 'broken.png': 'error', 'empty.png': { naturalWidth: 0 } });

  await expect(loadImage('broken.png')).resolves.toBe(false);
  await expect(loadImage('empty.png')).resolves.toBe(false);
});

test('fails after the timeout when the image never loads', async () => {
  jest.useFakeTimers();
  stubImageLoading({ 'slow.png': 'pending' });

  const result = loadImage('slow.png', 500);
  await jest.advanceTimersByTimeAsync(500);

  await expect(result).resolves.toBe(false);
});

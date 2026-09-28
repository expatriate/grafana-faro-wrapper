import { stubImageLoading } from '../testing/imageStubs';

let loadImage: typeof import('./loadImage').loadImage;

beforeEach(async () => {
  await jest.isolateModulesAsync(async () => {
    ({ loadImage } = await import('./loadImage'));
  });
});

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

test('reuses one image per address, so retrying a broken one at once sends no new request', async () => {
  const createImage = stubImageLoading({ 'broken.png': 'error' });

  await expect(loadImage('broken.png')).resolves.toBe(false);
  await expect(loadImage('broken.png')).resolves.toBe(false);

  expect(createImage).toHaveBeenCalledTimes(1);
});

test('requests a broken address again after a while, so a transient failure heals', async () => {
  jest.useFakeTimers({ doNotFake: ['queueMicrotask'] });
  const createImage = stubImageLoading({ 'flaky.png': ['error', { naturalWidth: 120 }] });

  await expect(loadImage('flaky.png')).resolves.toBe(false);
  jest.advanceTimersByTime(1000);
  await expect(loadImage('flaky.png')).resolves.toBe(false);
  jest.advanceTimersByTime(5000);
  await expect(loadImage('flaky.png')).resolves.toBe(true);

  expect(createImage).toHaveBeenCalledTimes(2);
});

test('shares one image between a relative and an absolute address of the same file', async () => {
  const createImage = stubImageLoading({ '/img/logo.png': { naturalWidth: 120 } });

  await expect(loadImage('/img/logo.png')).resolves.toBe(true);
  await expect(loadImage(`${location.origin}/img/logo.png`)).resolves.toBe(true);

  expect(createImage).toHaveBeenCalledTimes(1);
});

test('keeps broken addresses remembered when a check goes through more than 100 images', async () => {
  const loaded = Array.from({ length: 100 }, (_, index) => `logo-${index}.png`);
  const createImage = stubImageLoading({
    'broken.png': 'error',
    ...Object.fromEntries(loaded.map((src) => [src, { naturalWidth: 10 }])),
  });

  await loadImage('broken.png');
  await Promise.all(loaded.map((src) => loadImage(src)));
  await loadImage('broken.png');

  expect(createImage).toHaveBeenCalledTimes(101);
});

test('waits without a limit when the timeout is Infinity instead of failing at once', async () => {
  jest.useFakeTimers({ doNotFake: ['queueMicrotask'] });
  stubImageLoading({ 'slow.png': 'pending' });

  const result = loadImage('slow.png', Infinity);
  let settledEarly = false;
  result.then(() => {
    settledEarly = true;
  });
  await jest.advanceTimersByTimeAsync(60_000);

  expect(settledEarly).toBe(false);
});

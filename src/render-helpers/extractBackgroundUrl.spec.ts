import { extractBackgroundUrl } from './extractBackgroundUrl';

function backgroundUrlOf(backgroundImage: string) {
  jest
    .spyOn(window, 'getComputedStyle')
    .mockReturnValue({ backgroundImage } as CSSStyleDeclaration);
  return extractBackgroundUrl(document.body);
}

afterEach(() => {
  jest.restoreAllMocks();
});

test('reads the first image URL from a computed background', () => {
  expect(backgroundUrlOf('url("https://a.com/logo.png")')).toBe('https://a.com/logo.png');
  expect(backgroundUrlOf('linear-gradient(red, blue), url("https://a.com/bg.png")')).toBe(
    'https://a.com/bg.png',
  );
});

test('unescapes quotes inside the URL', () => {
  expect(backgroundUrlOf('url("https://a.com/a\\"b.png")')).toBe('https://a.com/a"b.png');
});

test('returns null when the background has no image', () => {
  expect(backgroundUrlOf('none')).toBeNull();
  expect(backgroundUrlOf('linear-gradient(red, blue)')).toBeNull();
});

test('picks the image-set candidate the screen density would show', () => {
  const imageSet =
    'linear-gradient(rgba(0, 0, 0, 0.5), red), image-set(url("https://a.com/2x.png") 2dppx, url("https://a.com/1x.png") 1dppx)';
  const onScreen = (devicePixelRatio: number) => {
    Object.defineProperty(window, 'devicePixelRatio', {
      configurable: true,
      value: devicePixelRatio,
    });
    return backgroundUrlOf(imageSet);
  };

  expect(onScreen(1)).toBe('https://a.com/1x.png');
  expect(onScreen(2)).toBe('https://a.com/2x.png');
  expect(onScreen(1.5)).toBe('https://a.com/2x.png');
  expect(onScreen(3)).toBe('https://a.com/2x.png');
  Object.defineProperty(window, 'devicePixelRatio', { configurable: true, value: 1 });
});

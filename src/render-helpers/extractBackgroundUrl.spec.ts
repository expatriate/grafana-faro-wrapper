/** @jest-environment jsdom */
import { extractBackgroundUrl } from './extractBackgroundUrl.ts';

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

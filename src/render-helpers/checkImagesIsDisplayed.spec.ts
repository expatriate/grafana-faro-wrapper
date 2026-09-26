import { checkImagesIsDisplayed } from './checkImagesIsDisplayed';
import { renderImages, stubDecodedImage } from '../testing/imageStubs';

test('passes when every image has loaded pixels', () => {
  const [logo, banner] = renderImages('https://a.com/logo.png', 'https://a.com/banner.png');
  stubDecodedImage(logo, { naturalWidth: 120 });
  stubDecodedImage(banner, { naturalWidth: 640 });

  expect(checkImagesIsDisplayed('img')).toBe(true);
});

test('fails on a broken raster image but accepts an SVG without intrinsic size', () => {
  const [svg, broken] = renderImages('https://a.com/icon.svg', 'https://a.com/broken.png');
  stubDecodedImage(svg, { naturalWidth: 0 });
  stubDecodedImage(broken, { naturalWidth: 0 });

  expect(checkImagesIsDisplayed('[src$=".svg"]')).toBe(true);
  expect(checkImagesIsDisplayed('img')).toBe(false);
});

test('fails when there are no images yet', () => {
  document.body.innerHTML = '';

  expect(checkImagesIsDisplayed('img')).toBe(false);
});

test('fails on an SVG that is still loading', () => {
  const [icon] = renderImages('https://a.com/icon.svg');
  stubDecodedImage(icon, { naturalWidth: 0, complete: false });

  expect(checkImagesIsDisplayed('img')).toBe(false);
});

test('checks images inside a wrapper the selector points at', () => {
  document.body.innerHTML =
    '<div data-slo="logo"><img src="https://a.com/logo.png"></div><div data-slo="empty"></div>';
  stubDecodedImage(document.querySelector('img')!, { naturalWidth: 120 });

  expect(checkImagesIsDisplayed('[data-slo="logo"]')).toBe(true);
  expect(checkImagesIsDisplayed('[data-slo]')).toBe(false);
});

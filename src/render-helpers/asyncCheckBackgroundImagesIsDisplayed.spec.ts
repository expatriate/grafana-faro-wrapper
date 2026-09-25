import { asyncCheckBackgroundImagesIsDisplayed } from './asyncCheckBackgroundImagesIsDisplayed.ts';
import { stubDecodedImage, stubImageLoading } from './imageStubs.ts';

afterEach(() => {
  jest.restoreAllMocks();
});

test('checks each element by its own image or background, selector lists included', async () => {
  document.body.innerHTML = `
    <a class="reseller" style="background-image: url(logo-a.png)"></a>
    <a class="partner"><img src="https://a.com/logo-b.png"></a>`;
  stubDecodedImage(document.querySelector('img')!, { naturalWidth: 120 });
  stubImageLoading({ 'logo-a.png': { naturalWidth: 90 } });

  await expect(asyncCheckBackgroundImagesIsDisplayed('.reseller, .partner')).resolves.toBe(true);
});

test('fails when any element background fails to load or is missing', async () => {
  document.body.innerHTML = `
    <a class="ok" style="background-image: url(ok.png)"></a>
    <a class="broken" style="background-image: url(broken.png)"></a>
    <a class="bare"></a>`;
  stubImageLoading({ 'ok.png': { naturalWidth: 90 }, 'broken.png': 'error' });

  await expect(asyncCheckBackgroundImagesIsDisplayed('.ok')).resolves.toBe(true);
  await expect(asyncCheckBackgroundImagesIsDisplayed('.ok, .broken')).resolves.toBe(false);
  await expect(asyncCheckBackgroundImagesIsDisplayed('.bare')).resolves.toBe(false);
});

test('fails when nothing matches the selector', async () => {
  document.body.innerHTML = '';

  await expect(asyncCheckBackgroundImagesIsDisplayed('.reseller')).resolves.toBe(false);
});

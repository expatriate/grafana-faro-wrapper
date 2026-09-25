import { checkRender } from './checkRender';

test('passes only when every selector is in the DOM', () => {
  document.body.innerHTML = '<div class="tariff"></div>';

  expect(checkRender(['.tariff'])).toBe(true);
  expect(checkRender(['.tariff', '.price'])).toBe(false);
});

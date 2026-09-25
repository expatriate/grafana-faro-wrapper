/** @jest-environment jsdom */
import { checkRenderInnerValue } from './checkRenderInnerValue.ts';

test('passes only when every element is present and not empty', () => {
  document.body.innerHTML = '<div class="tariff">Pro</div><div class="price"></div>';

  expect(checkRenderInnerValue(['.tariff'])).toBe(true);
  expect(checkRenderInnerValue(['.tariff', '.price'])).toBe(false);
  expect(checkRenderInnerValue(['.missing'])).toBe(false);
});

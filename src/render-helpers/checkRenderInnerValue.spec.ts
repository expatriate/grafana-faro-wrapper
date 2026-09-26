import { checkRenderInnerValue } from './checkRenderInnerValue';

test('passes only when every element is present and has text', () => {
  document.body.innerHTML = '<div class="tariff">Pro</div><div class="price"></div>';

  expect(checkRenderInnerValue(['.tariff'])).toBe(true);
  expect(checkRenderInnerValue('.tariff')).toBe(true);
  expect(checkRenderInnerValue(['.tariff', '.price'])).toBe(false);
  expect(checkRenderInnerValue(['.missing'])).toBe(false);
});

test('treats a template placeholder with only whitespace or a comment as empty', () => {
  document.body.innerHTML = '<div class="name">\n    </div><div class="price"><!-- --></div>';

  expect(checkRenderInnerValue('.name')).toBe(false);
  expect(checkRenderInnerValue('.price')).toBe(false);
});

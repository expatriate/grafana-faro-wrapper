import { checkRender } from './checkRender';

test('passes only when every selector is in the DOM', () => {
  document.body.innerHTML = '<div class="tariff"></div>';

  expect(checkRender(['.tariff'])).toBe(true);
  expect(checkRender('.tariff')).toBe(true);
  expect(checkRender(['.tariff', '.price'])).toBe(false);
});

test('an invalid selector fails the check with one warning instead of throwing', () => {
  const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
  document.body.innerHTML = '<div data-slo="code input"></div>';

  expect(checkRender('[data-slo=code input]')).toBe(false);
  expect(checkRender('[data-slo=code input]')).toBe(false);

  expect(warn).toHaveBeenCalledTimes(1);
  warn.mockRestore();
});

test('an empty list of selectors does not pass', () => {
  document.body.innerHTML = '<div class="tariff"></div>';

  expect(checkRender([])).toBe(false);
});

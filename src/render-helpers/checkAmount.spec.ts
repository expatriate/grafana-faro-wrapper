import { checkAmount } from './checkAmount';

afterEach(() => {
  jest.restoreAllMocks();
});

test('passes only for the exact number of elements', () => {
  document.body.innerHTML = '<li></li><li></li>';

  expect(checkAmount('li', 2)).toBe(true);
  expect(checkAmount('li', 1)).toBe(false);
  expect(checkAmount('li', 3)).toBe(false);
});

test('accepts the expected number as a string, as it comes from data attributes', () => {
  document.body.innerHTML = '<li></li><li></li>';

  expect(checkAmount('li', '2')).toBe(true);
  expect(checkAmount('li', 'two')).toBe(false);
});

test('fails for a selector the browser cannot parse, even when zero elements are expected', () => {
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  document.body.innerHTML = '';

  expect(checkAmount('[data-slo="errors" li', 0)).toBe(false);
});

test('does not read a missing or blank number as zero', () => {
  document.body.innerHTML = '';

  expect(checkAmount('li', null as unknown as number)).toBe(false);
  expect(checkAmount('li', '')).toBe(false);
  expect(checkAmount('li', '  ')).toBe(false);
  expect(checkAmount('li', '0')).toBe(true);
});

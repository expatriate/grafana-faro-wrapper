import { checkGTEAmount } from './checkGTEAmount';

afterEach(() => {
  jest.restoreAllMocks();
});

test('passes when there are at least the given number of elements', () => {
  document.body.innerHTML = '<li></li><li></li>';

  expect(checkGTEAmount('li', 2)).toBe(true);
  expect(checkGTEAmount('li', 1)).toBe(true);
  expect(checkGTEAmount('li', 3)).toBe(false);
});

test('accepts the minimum as a string and rejects something that is not a number', () => {
  document.body.innerHTML = '<li></li><li></li>';

  expect(checkGTEAmount('li', '2')).toBe(true);
  expect(checkGTEAmount('li', 'many')).toBe(false);
});

test('fails for a selector the browser cannot parse, even when zero elements are expected', () => {
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  document.body.innerHTML = '';

  expect(checkGTEAmount('[data-slo="errors" li', 0)).toBe(false);
});

test('does not read a missing or blank number as zero', () => {
  document.body.innerHTML = '';

  expect(checkGTEAmount('li', null as unknown as number)).toBe(false);
  expect(checkGTEAmount('li', '')).toBe(false);
  expect(checkGTEAmount('li', '  ')).toBe(false);
  expect(checkGTEAmount('li', '0')).toBe(true);
});

import { checkAmount } from './checkAmount';

test('passes only for the exact number of elements', () => {
  document.body.innerHTML = '<li></li><li></li>';

  expect(checkAmount('li', 2)).toBe(true);
  expect(checkAmount('li', 1)).toBe(false);
  expect(checkAmount('li', 3)).toBe(false);
});

test('accepts the expected number as a string, as it comes from data attributes', () => {
  document.body.innerHTML = '<li></li><li></li>';

  expect(checkAmount('li', '2' as unknown as number)).toBe(true);
  expect(checkAmount('li', 'two' as unknown as number)).toBe(false);
});

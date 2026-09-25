/** @jest-environment jsdom */
import { checkAmount } from './checkAmount.ts';

test('passes only for the exact number of elements', () => {
  document.body.innerHTML = '<li></li><li></li>';

  expect(checkAmount('li', 2)).toBe(true);
  expect(checkAmount('li', 1)).toBe(false);
  expect(checkAmount('li', 3)).toBe(false);
});

import { checkGTEAmount } from './checkGTEAmount.ts';

test('passes when there are at least the given number of elements', () => {
  document.body.innerHTML = '<li></li><li></li>';

  expect(checkGTEAmount('li', 2)).toBe(true);
  expect(checkGTEAmount('li', 1)).toBe(true);
  expect(checkGTEAmount('li', 3)).toBe(false);
});

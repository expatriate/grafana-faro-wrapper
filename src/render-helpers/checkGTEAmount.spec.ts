import { checkGTEAmount } from './checkGTEAmount';

test('passes when there are at least the given number of elements', () => {
  document.body.innerHTML = '<li></li><li></li>';

  expect(checkGTEAmount('li', 2)).toBe(true);
  expect(checkGTEAmount('li', 1)).toBe(true);
  expect(checkGTEAmount('li', 3)).toBe(false);
});

test('accepts the minimum as a string and rejects something that is not a number', () => {
  document.body.innerHTML = '<li></li><li></li>';

  expect(checkGTEAmount('li', '2' as unknown as number)).toBe(true);
  expect(checkGTEAmount('li', 'many' as unknown as number)).toBe(false);
});

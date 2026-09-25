import { getAmount } from './getAmount.ts';

test('counts elements matching the selector', () => {
  document.body.innerHTML = '<li></li><li></li>';

  expect(getAmount('li')).toBe(2);
  expect(getAmount('img')).toBe(0);
});

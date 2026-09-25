/** @jest-environment jsdom */
import { checkEnabledButtonState } from './checkEnabledButtonState.ts';

test('passes only for a present button that is neither disabled nor styled as disabled', () => {
  document.body.innerHTML = `
    <button class="pay"></button>
    <button class="locked" disabled></button>
    <button class="styled disabled"></button>`;

  expect(checkEnabledButtonState('.pay')).toBe(true);
  expect(checkEnabledButtonState('.locked')).toBe(false);
  expect(checkEnabledButtonState('.styled')).toBe(false);
  expect(checkEnabledButtonState('.missing')).toBe(false);
});

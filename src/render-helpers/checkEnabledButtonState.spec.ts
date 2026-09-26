import { checkEnabledButtonState } from './checkEnabledButtonState';

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

test('treats a button in a disabled fieldset or marked aria-disabled as not clickable', () => {
  document.body.innerHTML = `
    <fieldset disabled><button class="in-form"></button></fieldset>
    <button class="aria" aria-disabled="true"></button>
    <button class="aria-false" aria-disabled="false"></button>
    <input class="submit" type="submit" disabled>`;

  expect(checkEnabledButtonState('.in-form')).toBe(false);
  expect(checkEnabledButtonState('.aria')).toBe(false);
  expect(checkEnabledButtonState('.aria-false')).toBe(true);
  expect(checkEnabledButtonState('.submit')).toBe(false);
});

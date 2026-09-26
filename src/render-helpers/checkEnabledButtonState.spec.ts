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

test('treats an inert, invisible or click-through button as not clickable', () => {
  document.body.innerHTML = `
    <div inert><button class="inert"></button></div>
    <button class="invisible" style="visibility: hidden"></button>
    <button class="click-through" style="pointer-events: none"></button>`;

  expect(checkEnabledButtonState('.inert')).toBe(false);
  expect(checkEnabledButtonState('.invisible')).toBe(false);
  expect(checkEnabledButtonState('.click-through')).toBe(false);
});

test('passes when any matching button can be clicked, even if a hidden copy is disabled', () => {
  document.body.innerHTML = '<button class="pay" disabled></button><button class="pay"></button>';

  expect(checkEnabledButtonState('.pay')).toBe(true);
});

test('treats a button the browser does not render as not clickable', () => {
  document.body.innerHTML = '<button class="pay"></button>';
  const button = document.querySelector('.pay')!;
  Object.defineProperty(button, 'innerText', { value: '' });
  button.getClientRects = () => [] as unknown as DOMRectList;

  expect(checkEnabledButtonState('.pay')).toBe(false);
});

export function checkEnabledButtonState(selector: string): boolean {
  const button = document.querySelector<HTMLButtonElement>(selector);
  return button !== null && !button.disabled && !button.classList.contains('disabled');
}

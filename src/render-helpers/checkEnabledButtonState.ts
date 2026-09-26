import { queryOne } from '../utils/safeQuery';

export function checkEnabledButtonState(selector: string): boolean {
  const button = queryOne<HTMLButtonElement>(selector);
  return button !== null && !button.disabled && !button.classList.contains('disabled');
}

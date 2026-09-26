import { queryOne } from '../utils/safeQuery';

export function checkEnabledButtonState(selector: string): boolean {
  const button = queryOne(selector);
  return (
    button !== null &&
    !button.matches(':disabled') &&
    button.getAttribute('aria-disabled') !== 'true' &&
    !button.classList.contains('disabled')
  );
}

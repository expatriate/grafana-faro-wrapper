import { queryAll } from '../utils/safeQuery';
import { isPressable } from './rendering';

export function checkEnabledButtonState(selector: string): boolean {
  return queryAll(selector).some(isPressable);
}

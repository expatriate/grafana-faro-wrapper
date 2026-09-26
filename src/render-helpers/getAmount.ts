import { queryAll } from '../utils/safeQuery';

export function getAmount(selector: string): number {
  return queryAll(selector).length;
}

import { queryOne } from '../utils/safeQuery';

export function checkRender(selectors: string | string[]): boolean {
  return [selectors].flat().every((selector) => queryOne(selector) !== null);
}

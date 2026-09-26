import { queryOne } from '../utils/safeQuery';

export function checkRender(selectors: string | string[]): boolean {
  const list = [selectors].flat();
  return list.length > 0 && list.every((selector) => queryOne(selector) !== null);
}

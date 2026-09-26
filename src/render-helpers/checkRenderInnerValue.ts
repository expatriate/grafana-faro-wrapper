import { queryOne } from '../utils/safeQuery';

export function checkRenderInnerValue(selectors: string | string[]): boolean {
  return [selectors].flat().every((selector) => Boolean(queryOne(selector)?.textContent?.trim()));
}

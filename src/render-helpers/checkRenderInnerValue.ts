import { queryAll } from '../utils/safeQuery';
import { renderedText } from './rendering';

export function checkRenderInnerValue(selectors: string | string[]): boolean {
  const list = [selectors].flat();
  return (
    list.length > 0 &&
    list.every((selector) => queryAll(selector).some((element) => renderedText(element) !== ''))
  );
}

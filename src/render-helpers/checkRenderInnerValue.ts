import { queryAll } from '../utils/safeQuery';
import { renderedText } from './rendering';

export function checkRenderInnerValue(selectors: string | string[]): boolean {
  return [selectors]
    .flat()
    .every((selector) => queryAll(selector).some((element) => renderedText(element) !== ''));
}

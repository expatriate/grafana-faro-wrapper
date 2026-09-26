import { queryOne } from '../utils/safeQuery';

const INVISIBLE_CHARACTERS = /[​-‍⁠﻿]/g;
const NON_RENDERED_CONTENT = 'script, style, template, noscript';

function textWithoutLayout(element: Element): string {
  const copy = element.cloneNode(true) as Element;
  copy.querySelectorAll(NON_RENDERED_CONTENT).forEach((node) => node.remove());
  return copy.textContent ?? '';
}

function renderedText(element: Element): string {
  const { innerText } = element as Partial<HTMLElement>;
  // innerText is undefined where there is no layout engine, e.g. jsdom
  const text = typeof innerText === 'string' ? innerText : textWithoutLayout(element);
  return text.replace(INVISIBLE_CHARACTERS, '').trim();
}

export function checkRenderInnerValue(selectors: string | string[]): boolean {
  return [selectors].flat().every((selector) => {
    const element = queryOne(selector);
    return element !== null && renderedText(element) !== '';
  });
}

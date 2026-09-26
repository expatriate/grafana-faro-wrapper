const INVISIBLE_CHARACTERS = /[​-‍⁠﻿]/g;
const NON_RENDERED_CONTENT = 'script, style, template, noscript';

function hasLayoutEngine(element: Element): boolean {
  // jsdom and similar DOMs without layout have no innerText
  return typeof (element as Partial<HTMLElement>).innerText === 'string';
}

export function isRendered(element: Element): boolean {
  if (!hasLayoutEngine(element)) {
    return true;
  }
  if (getComputedStyle(element).display === 'contents') {
    return element.parentElement === null || isRendered(element.parentElement);
  }
  return element.getClientRects().length > 0;
}

function textWithoutLayout(element: Element): string {
  const copy = element.cloneNode(true) as Element;
  copy.querySelectorAll(NON_RENDERED_CONTENT).forEach((node) => node.remove());
  return copy.textContent ?? '';
}

export function renderedText(element: Element): string {
  if (!element.textContent?.trim() || !isRendered(element)) {
    return '';
  }
  const text = hasLayoutEngine(element)
    ? (element as HTMLElement).innerText
    : textWithoutLayout(element);
  return text.replace(INVISIBLE_CHARACTERS, '').trim();
}

export function isPressable(element: Element): boolean {
  if (
    element.matches(':disabled') ||
    element.closest('[inert]') !== null ||
    element.getAttribute('aria-disabled') === 'true' ||
    element.classList.contains('disabled') ||
    !isRendered(element)
  ) {
    return false;
  }
  const { visibility, pointerEvents } = getComputedStyle(element);
  return visibility !== 'hidden' && visibility !== 'collapse' && pointerEvents !== 'none';
}

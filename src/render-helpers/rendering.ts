const INVISIBLE_CHARACTERS =
  /[\u00AD\u061C\u200B-\u200F\u202A-\u202E\u2060-\u2064\u2066-\u2069\uFEFF]/g;
const NON_RENDERED_CONTENT = 'script, style, template, noscript';

function domHasLayout(): boolean {
  // jsdom and similar DOMs without layout have no innerText
  return typeof document.documentElement.innerText === 'string';
}

function isInCollapsedContent(element: Element): boolean {
  const details = element.parentElement?.closest('details:not([open])');
  const inClosedDetails =
    details != null && !details.querySelector(':scope > summary')?.contains(element);
  return inClosedDetails || element.closest('[hidden]') !== null;
}

const isSelect = (element: Element): element is HTMLSelectElement => element.localName === 'select';

const isOption = (element: Element): element is HTMLOptionElement => element.localName === 'option';

function isShownOption(option: HTMLOptionElement): boolean {
  const select = option.closest('select');
  const isListBox = select !== null && (select.multiple || select.size > 1);
  return select !== null && (option.selected || isListBox) && isRendered(select);
}

export function isRendered(element: Element): boolean {
  if (!domHasLayout()) {
    return true;
  }
  if (isOption(element)) {
    return isShownOption(element);
  }
  if (getComputedStyle(element).display === 'contents') {
    return element.parentElement === null || isRendered(element.parentElement);
  }
  // checkVisibility() is missing before Chrome 105 and Safari 17.4, which README still supports
  if (isInCollapsedContent(element) || element.checkVisibility?.() === false) {
    return false;
  }
  return element.getClientRects().length > 0;
}

function textWithoutLayout(element: Element): string {
  const copy = element.cloneNode(true) as Element;
  copy.querySelectorAll(NON_RENDERED_CONTENT).forEach((node) => node.remove());
  return copy.textContent ?? '';
}

function visibleText(element: Element): string {
  if (isSelect(element)) {
    return Array.from(element.selectedOptions, (option) => option.text).join(' ');
  }
  if (isOption(element)) {
    return element.text;
  }
  const { innerText } = element as Partial<HTMLElement>;
  if (typeof innerText === 'string') {
    const shadowText = Array.from(element.shadowRoot?.children ?? [], renderedText).join(' ');
    return `${innerText} ${shadowText}`;
  }
  return textWithoutLayout(element);
}

export function renderedText(element: Element): string {
  const hasText = Boolean(element.textContent?.trim() || element.shadowRoot);
  if (!hasText || !isRendered(element)) {
    return '';
  }
  return visibleText(element).replace(INVISIBLE_CHARACTERS, '').trim();
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

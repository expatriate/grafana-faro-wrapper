export function renderAs(
  element: Element,
  { text, rendered }: { text: string; rendered: boolean },
) {
  Object.defineProperty(document.documentElement, 'innerText', { value: '', configurable: true });
  Object.defineProperty(element, 'innerText', { value: text, configurable: true });
  element.getClientRects = () => (rendered ? [{}] : []) as unknown as DOMRectList;
}

export function forgetLayout() {
  delete (document.documentElement as Partial<HTMLElement>).innerText;
}

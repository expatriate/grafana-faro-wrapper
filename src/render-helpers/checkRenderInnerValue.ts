export function checkRenderInnerValue(selectors: string[]): boolean {
  return selectors.every(
    (selector) => (document.querySelector(selector)?.innerHTML.length ?? 0) > 0,
  );
}

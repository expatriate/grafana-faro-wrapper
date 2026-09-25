export function checkRenderInnerValue(selectors: string[]): boolean {
  return selectors.every((selector) => Boolean(document.querySelector(selector)?.innerHTML));
}

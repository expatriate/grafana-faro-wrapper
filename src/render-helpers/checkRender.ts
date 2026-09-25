export function checkRender(selectors: string[]): boolean {
  return selectors.every((selector) => document.querySelector(selector) !== null);
}

export function getAmount(selector: string): number {
  return document.querySelectorAll(selector).length;
}

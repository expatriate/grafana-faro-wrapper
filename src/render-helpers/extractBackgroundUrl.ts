const FIRST_CSS_URL = /url\((['"]?)((?:\\.|[^\\])*?)\1\)/;

export function extractBackgroundUrl(element: Element): string | null {
  const match = getComputedStyle(element).backgroundImage.match(FIRST_CSS_URL);
  return match ? match[2].replace(/\\(.)/g, '$1') : null;
}

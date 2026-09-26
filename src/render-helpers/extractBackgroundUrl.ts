const FIRST_CSS_URL = /url\((['"]?)((?:\\.|[^\\])*?)\1\)/;
const IMAGE_SET_CANDIDATE = /url\((['"]?)((?:\\.|[^\\])*?)\1\)\s*(?:([\d.]+)(?:dppx|x))?/;
const IMAGE_SET_CANDIDATES = new RegExp(IMAGE_SET_CANDIDATE.source, 'g');

function topLevelLayers(value: string): string[] {
  const layers: string[] = [];
  let depth = 0;
  let quote = '';
  let start = 0;
  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    if (quote) {
      if (char === '\\') {
        index += 1;
      } else if (char === quote) {
        quote = '';
      }
    } else if (char === '"' || char === "'") {
      quote = char;
    } else if (char === '(') {
      depth += 1;
    } else if (char === ')') {
      depth -= 1;
    } else if (char === ',' && depth === 0) {
      layers.push(value.slice(start, index).trim());
      start = index + 1;
    }
  }
  layers.push(value.slice(start).trim());
  return layers;
}

function urlForScreenDensity(imageSet: string): string | null {
  const candidates = (imageSet.match(IMAGE_SET_CANDIDATES) ?? [])
    .map((candidate) => {
      const [, , url, density] = candidate.match(IMAGE_SET_CANDIDATE) ?? [];
      return { url, density: Number(density ?? 1) };
    })
    .sort((a, b) => a.density - b.density);
  const chosen =
    candidates.find(({ density }) => density >= window.devicePixelRatio) ?? candidates.pop();
  return chosen?.url ?? null;
}

export function extractBackgroundUrl(element: Element): string | null {
  if (!(element instanceof Element)) {
    return null;
  }
  const layer = topLevelLayers(getComputedStyle(element).backgroundImage).find((candidate) =>
    candidate.includes('url('),
  );
  if (!layer) {
    return null;
  }
  const url = /^(-webkit-)?image-set\(/.test(layer)
    ? urlForScreenDensity(layer)
    : (layer.match(FIRST_CSS_URL)?.[2] ?? null);
  return url === null ? null : url.replace(/\\(.)/g, '$1');
}

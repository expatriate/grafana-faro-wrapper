const UUID_WITH_OPTIONAL_SUFFIX =
  /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}[a-z0-9]*\b/g;
const LONG_HEX_ID = /\b[0-9a-f]{12,}\b/g;
const NUMERIC_ID = /\b\d{6,}\b/g;

const ID_PATTERNS = [UUID_WITH_OPTIONAL_SUFFIX, LONG_HEX_ID, NUMERIC_ID];

export function sanitizeUrl(input: string): string {
  try {
    const url = new URL(input);
    const pathname = ID_PATTERNS.reduce(
      (path, pattern) => path.replace(pattern, ':id'),
      url.pathname.toLowerCase(),
    );
    return url.host + pathname;
  } catch {
    return input;
  }
}

export function sanitizePageUrlParams(beacon: Record<string, any>): Record<string, any> {
  if (!beacon.meta?.page?.url) return beacon;

  return {
    ...beacon,
    meta: {
      ...beacon.meta,
      page: {
        ...beacon.meta.page,
        url: sanitizeUrl(beacon.meta.page.url),
      },
    },
  };
}

export function sanitizeEventUrlParams(beacon: Record<string, any>): Record<string, any> {
  const isResourceTiming =
    beacon.type === 'event' && beacon.payload?.name === 'faro.performance.resource';
  if (!isResourceTiming || !beacon.payload.attributes?.name) return beacon;

  return {
    ...beacon,
    payload: {
      ...beacon.payload,
      attributes: {
        ...beacon.payload.attributes,
        name: sanitizeUrl(beacon.payload.attributes.name),
      },
    },
  };
}

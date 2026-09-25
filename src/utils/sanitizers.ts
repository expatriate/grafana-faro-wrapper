const UUID_WITH_OPTIONAL_SUFFIX =
  /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}[a-z0-9]*\b/g;
const LONG_HEX_ID = /\b[0-9a-f]{12,}\b/g;
const NUMERIC_ID = /\b\d{6,}\b/g;

const ID_PATTERNS = [UUID_WITH_OPTIONAL_SUFFIX, LONG_HEX_ID, NUMERIC_ID];
const ABSOLUTE_HTTP_URL = /^https?:\/\//i;

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

export function sanitizePageUrl(beacon: Record<string, any>): Record<string, any> {
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

export function sanitizeEventUrls(beacon: Record<string, any>): Record<string, any> {
  const attributes = beacon.type === 'event' ? beacon.payload?.attributes : undefined;
  if (!attributes) return beacon;

  return {
    ...beacon,
    payload: {
      ...beacon.payload,
      attributes: Object.fromEntries(
        Object.entries(attributes).map(([key, value]) => [
          key,
          typeof value === 'string' && ABSOLUTE_HTTP_URL.test(value) ? sanitizeUrl(value) : value,
        ]),
      ),
    },
  };
}

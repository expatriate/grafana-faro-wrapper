import {
  EventEvent,
  ExceptionEvent,
  TransportItem,
  TransportItemType,
} from '@grafana/faro-web-sdk';

const ID_START = '(^|[^0-9a-z])';
const ID_END = '(?=$|[^0-9a-z])';
const idPattern = (id: string) => new RegExp(`${ID_START}${id}${ID_END}`, 'g');

const ID_PATTERNS = [
  idPattern('[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}[a-z0-9]*'),
  idPattern('[0-9a-f]{12,}'),
  idPattern('\\d{6,}'),
];
const ABSOLUTE_HTTP_URL = /^https?:\/\//i;
const QUERY_OR_HASH = /[?#]/;

export function sanitizePath(pathname: string): string {
  return ID_PATTERNS.reduce(
    (path, pattern) => path.replace(pattern, '$1:id'),
    pathname.toLowerCase(),
  );
}

export function sanitizeUrl(input: string): string {
  try {
    const url = new URL(input);
    return url.host + sanitizePath(url.pathname);
  } catch {
    return sanitizePath(input.split(QUERY_OR_HASH)[0]);
  }
}

const sanitizeIfUrl = (value: string) =>
  ABSOLUTE_HTTP_URL.test(value) ? sanitizeUrl(value) : value;

export function sanitizePageUrl(beacon: TransportItem): TransportItem {
  const url = beacon.meta.page?.url;
  if (!url) {
    return beacon;
  }

  return {
    ...beacon,
    meta: { ...beacon.meta, page: { ...beacon.meta.page, url: sanitizeUrl(url) } },
  };
}

export function sanitizeEventUrls(beacon: TransportItem): TransportItem {
  if (beacon.type !== TransportItemType.EVENT) {
    return beacon;
  }
  const event = beacon.payload as EventEvent;
  if (!event.attributes) {
    return beacon;
  }

  return {
    ...beacon,
    payload: {
      ...event,
      attributes: Object.fromEntries(
        Object.entries(event.attributes).map(([key, value]) => [key, sanitizeIfUrl(value)]),
      ),
    },
  };
}

export function sanitizeStacktraceUrls(beacon: TransportItem): TransportItem {
  if (beacon.type !== TransportItemType.EXCEPTION) {
    return beacon;
  }
  const exception = beacon.payload as ExceptionEvent;
  if (!exception.stacktrace?.frames) {
    return beacon;
  }

  return {
    ...beacon,
    payload: {
      ...exception,
      stacktrace: {
        ...exception.stacktrace,
        frames: exception.stacktrace.frames.map((frame) => ({
          ...frame,
          filename: sanitizeIfUrl(frame.filename),
        })),
      },
    },
  };
}

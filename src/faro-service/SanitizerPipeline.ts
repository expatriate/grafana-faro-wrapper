import { BrowserConfig, TransportItem } from '@grafana/faro-web-sdk';
import { LOG_PREFIX } from '../utils/logPrefix';
import { sanitizeEventUrls, sanitizePageUrl, sanitizeStacktraceUrls } from '../utils/sanitizers';

export type Sanitizer = (beacon: TransportItem) => TransportItem;

type BeforeSend = BrowserConfig['beforeSend'];

const DEFAULT_SANITIZERS: readonly Sanitizer[] = [
  sanitizePageUrl,
  sanitizeEventUrls,
  sanitizeStacktraceUrls,
];

function copyBeacon(beacon: TransportItem): TransportItem {
  const copy: TransportItem = JSON.parse(JSON.stringify(beacon));
  const originalError = (beacon.payload as { originalError?: Error } | undefined)?.originalError;
  if (originalError) {
    (copy.payload as { originalError?: Error }).originalError = originalError;
  }
  return copy;
}

export class SanitizerPipeline {
  private sanitizers = [...DEFAULT_SANITIZERS];

  private beforeSend: BeforeSend;

  private failureReported = false;

  add(sanitizers: Sanitizer[]) {
    this.sanitizers = [...this.sanitizers, ...sanitizers];
  }

  endWith(beforeSend: BeforeSend) {
    this.beforeSend = beforeSend;
  }

  run(beacon: TransportItem): TransportItem | null {
    try {
      const sanitized = this.sanitizers.reduce<TransportItem>((item, sanitize) => {
        const result = sanitize(item);
        if (typeof result !== 'object' || result === null) {
          throw new TypeError('sanitizer returned no beacon');
        }
        return result;
      }, copyBeacon(beacon));
      return this.beforeSend ? this.beforeSend(sanitized) : sanitized;
    } catch (error) {
      if (!this.failureReported) {
        this.failureReported = true;
        console.warn(
          `${LOG_PREFIX} A sanitizer or beforeSend failed, beacons it fails on are dropped:`,
          error,
        );
      }
      return null;
    }
  }
}

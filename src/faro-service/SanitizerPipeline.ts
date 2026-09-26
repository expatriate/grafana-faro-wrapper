import { TransportItem } from '@grafana/faro-web-sdk';
import { parseMetricLabels } from '../measurement/parseMetricLabels';
import { LOG_PREFIX } from '../utils/logPrefix';
import { sanitizeEventUrls, sanitizePageUrl, sanitizeStacktraceUrls } from '../utils/sanitizers';

export type Sanitizer = (beacon: TransportItem) => TransportItem;

const DEFAULT_SANITIZERS: readonly Sanitizer[] = [
  sanitizePageUrl,
  sanitizeEventUrls,
  sanitizeStacktraceUrls,
  parseMetricLabels,
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

  private failureReported = false;

  add(sanitizers: Sanitizer[]) {
    this.sanitizers = [...this.sanitizers, ...sanitizers];
  }

  reset() {
    this.sanitizers = [...DEFAULT_SANITIZERS];
    this.failureReported = false;
  }

  run(beacon: TransportItem): TransportItem | null {
    try {
      return this.sanitizers.reduce<TransportItem>((item, sanitize) => {
        const sanitized = sanitize(item);
        if (typeof sanitized !== 'object' || sanitized === null) {
          throw new TypeError('sanitizer returned no beacon');
        }
        return sanitized;
      }, copyBeacon(beacon));
    } catch (error) {
      if (!this.failureReported) {
        this.failureReported = true;
        console.warn(`${LOG_PREFIX} A sanitizer failed, beacons it fails on are dropped:`, error);
      }
      return null;
    }
  }
}

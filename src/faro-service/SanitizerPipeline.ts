import { TransportItem } from '@grafana/faro-web-sdk';
import { parseMetricLabels } from '../measurement/parseMetricLabels';
import { LOG_PREFIX } from '../utils/logPrefix';
import { sanitizeEventUrls, sanitizePageUrl } from '../utils/sanitizers';

export type Sanitizer = (beacon: TransportItem) => TransportItem;

const DEFAULT_SANITIZERS: Sanitizer[] = [sanitizePageUrl, sanitizeEventUrls, parseMetricLabels];

export class SanitizerPipeline {
  private sanitizers = [...DEFAULT_SANITIZERS];

  private failureReported = false;

  add(sanitizers: Sanitizer[]) {
    this.sanitizers = [...this.sanitizers, ...sanitizers];
  }

  reset() {
    this.sanitizers = [...DEFAULT_SANITIZERS];
  }

  run(beacon: TransportItem): TransportItem | null {
    try {
      return this.sanitizers.reduce<TransportItem>(
        (item, sanitize) => {
          const sanitized = sanitize(item);
          if (typeof sanitized !== 'object' || sanitized === null) {
            throw new TypeError('sanitizer returned no beacon');
          }
          return sanitized;
        },
        { ...beacon, meta: JSON.parse(JSON.stringify(beacon.meta)) },
      );
    } catch (error) {
      if (!this.failureReported) {
        this.failureReported = true;
        console.warn(`${LOG_PREFIX} A sanitizer failed, beacons it fails on are dropped:`, error);
      }
      return null;
    }
  }
}

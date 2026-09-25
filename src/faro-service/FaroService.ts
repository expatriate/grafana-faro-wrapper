import {
  BrowserConfig,
  deepEqual,
  Faro,
  initializeFaro,
  Instrumentation,
  TransportItem,
} from '@grafana/faro-web-sdk';
import { OtlpHttpTransport } from '@grafana/faro-transport-otlp-http';
import { MEASUREMENT_KEYS } from '../measurement/keys.ts';
import { parseMetricLabels } from '../measurement/parseMetricLabels.ts';
import { sendMeasurement } from '../measurement/sendMeasurement.ts';
import { Metric } from '../measurement/types.ts';
import { SloConfig, SloTracker, trackSlo } from '../slo/trackSlo.ts';
import { toLogfmt } from '../utils/logfmt.ts';
import { LOG_PREFIX } from '../utils/logPrefix.ts';
import { sanitizeEventUrls, sanitizePageUrl } from '../utils/sanitizers.ts';

export interface FaroConfig {
  faroUrl: string;
  faroKey: string;
}

export type FaroServiceConfig = FaroConfig &
  Omit<BrowserConfig, 'url' | 'apiKey' | 'paused'> & {
    routerAdapter?: Instrumentation;
    enabled?: boolean;
  };

export type Sanitizer = (beacon: TransportItem) => TransportItem;

type OtlpTransform = NonNullable<
  ConstructorParameters<typeof OtlpHttpTransport>[0]['otlpTransform']
>;

const DEFAULT_SANITIZERS: Sanitizer[] = [sanitizePageUrl, sanitizeEventUrls, parseMetricLabels];

function measurementValueFields(values: Record<string, number>) {
  const [first, ...extra] = Object.entries(values);
  return {
    name: first?.[0],
    value: first?.[1],
    ...Object.fromEntries(extra.map(([key, value]) => [`value_${key}`, value])),
  };
}

const OTLP_LOG_BODIES: OtlpTransform = {
  createMeasurementLogBody({ payload }) {
    return toLogfmt({
      faro_signal: 'measurement',
      type: payload.type,
      ...measurementValueFields(payload.values),
      result: payload.context?.[MEASUREMENT_KEYS.RESULT],
    });
  },
  createErrorLogBody({ payload }) {
    return toLogfmt({ faro_signal: 'error', type: payload.type, message: payload.value });
  },
};

type FaroIdentity = Pick<FaroConfig & BrowserConfig, 'faroUrl' | 'faroKey' | 'app'>;

type ServiceState =
  { kind: 'idle' } | { kind: 'active' | 'paused'; faro: Faro; identity: FaroIdentity };

export class FaroService {
  private state: ServiceState = { kind: 'idle' };
  private sanitizers = [...DEFAULT_SANITIZERS];
  private userBeforeSend: BrowserConfig['beforeSend'];
  private sanitizerFailureReported = false;

  init({
    faroKey,
    faroUrl,
    transports = [],
    instrumentations = [],
    beforeSend,
    routerAdapter,
    enabled = true,
    ...rest
  }: FaroServiceConfig): Faro {
    if (this.state.kind === 'active') {
      console.warn(`${LOG_PREFIX} FaroService already initialized`);
      return this.state.faro;
    }

    this.userBeforeSend = beforeSend;
    const identity = { faroUrl, faroKey, app: rest.app };

    if (this.state.kind === 'paused') {
      this.warnAboutIgnoredChanges(this.state.identity, identity);
      this.state.faro.unpause();
      this.state = { ...this.state, kind: 'active' };
      return this.state.faro;
    }

    const faro = initializeFaro({
      transports: [
        new OtlpHttpTransport({
          apiKey: faroKey,
          logsURL: faroUrl,
          otlpTransform: OTLP_LOG_BODIES,
        }),
        ...transports,
      ],

      instrumentations: [...(routerAdapter ? [routerAdapter] : []), ...instrumentations],
      paused: !enabled,

      beforeSend: (beacon) => {
        const sanitized = this.sanitize(beacon);
        if (!sanitized) {
          return null;
        }
        return this.userBeforeSend ? this.userBeforeSend(sanitized) : sanitized;
      },

      ...rest,
    });

    if (!faro) {
      throw new Error(`${LOG_PREFIX} Faro is already registered outside FaroService`);
    }

    this.state = { kind: 'active', faro, identity };
    return faro;
  }

  addSanitizer(sanitizer: Sanitizer | Sanitizer[]) {
    const newSanitizers = Array.isArray(sanitizer) ? sanitizer : [sanitizer];
    this.sanitizers = [...this.sanitizers, ...newSanitizers];
  }

  sendMetric(metric: Metric) {
    try {
      sendMeasurement(this.getInstance(), metric);
    } catch (error) {
      console.warn(
        `${LOG_PREFIX} Failed to send metric:`,
        error instanceof Error ? error.message : 'Unknown error',
      );
    }
  }

  trackSlo<S extends string>(config: SloConfig<S>): SloTracker {
    return trackSlo((metric) => this.sendMetric(metric), config);
  }

  get isInitialized() {
    return this.state.kind === 'active';
  }

  getInstance(): Faro {
    if (this.state.kind !== 'active') {
      throw new Error(`${LOG_PREFIX} Faro not initialized. Call init() first.`);
    }
    return this.state.faro;
  }

  destroy() {
    if (this.state.kind !== 'active') {
      return;
    }
    this.state.faro.pause();
    this.state = { ...this.state, kind: 'paused' };
    this.sanitizers = [...DEFAULT_SANITIZERS];
  }

  private sanitize(beacon: TransportItem): TransportItem | null {
    try {
      return this.sanitizers.reduce<TransportItem>(
        (item, sanitize) => {
          const sanitized = sanitize(item);
          if (typeof sanitized !== 'object' || sanitized === null) {
            throw new TypeError('sanitizer returned no beacon');
          }
          return sanitized;
        },
        { ...beacon, meta: beacon.meta && JSON.parse(JSON.stringify(beacon.meta)) },
      );
    } catch (error) {
      if (!this.sanitizerFailureReported) {
        this.sanitizerFailureReported = true;
        console.warn(`${LOG_PREFIX} A sanitizer failed, beacons it fails on are dropped:`, error);
      }
      return null;
    }
  }

  private warnAboutIgnoredChanges(initial: FaroIdentity, identity: FaroIdentity) {
    const changed = (Object.keys(identity) as (keyof FaroIdentity)[]).filter(
      (option) => !deepEqual(identity[option], initial[option]),
    );
    if (changed.length > 0) {
      console.warn(
        `${LOG_PREFIX} Faro cannot be re-initialized, changed options are ignored: ${changed.join(', ')}`,
      );
    }
  }
}

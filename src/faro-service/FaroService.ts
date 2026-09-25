import {
  BrowserConfig,
  deepEqual,
  Faro,
  initializeFaro,
  Instrumentation,
  TransportItem,
} from '@grafana/faro-web-sdk';
import { OtlpHttpTransport } from '@grafana/faro-transport-otlp-http';
import { parseMetricLabels } from '../metrics-service/helpers/parseMetricLabels.ts';
import { MEASUREMENT_KEYS } from '../metrics-service/types.ts';
import { toLogfmt } from '../utils/logfmt.ts';
import { LOG_PREFIX } from '../utils/logPrefix.ts';
import { sanitizeEventUrls, sanitizePageUrl } from '../utils/sanitizers.ts';

export interface FaroConfig {
  faroUrl: string;
  faroKey: string;
}

export type FaroServiceConfig = FaroConfig & BrowserConfig & { routerAdapter?: Instrumentation };

export type Sanitizer = (beacon: Record<string, any>) => Record<string, any>;

type OtlpTransform = NonNullable<
  ConstructorParameters<typeof OtlpHttpTransport>[0]['otlpTransform']
>;

const DEFAULT_SANITIZERS: Sanitizer[] = [sanitizePageUrl, sanitizeEventUrls, parseMetricLabels];

const OTLP_LOG_BODIES: OtlpTransform = {
  createMeasurementLogBody({ payload }) {
    const [[name, value] = [], ...extraValues] = Object.entries(payload.values);

    return toLogfmt({
      faro_signal: 'measurement',
      type: payload.type,
      name,
      value,
      ...Object.fromEntries(extraValues.map(([key, extra]) => [`value_${key}`, extra])),
      result: payload.context?.[MEASUREMENT_KEYS.RESULT],
    });
  },
  createErrorLogBody({ payload }) {
    return toLogfmt({ faro_signal: 'error', type: payload.type, message: payload.value });
  },
};

type FaroIdentity = Pick<FaroConfig & BrowserConfig, 'faroUrl' | 'faroKey' | 'app'>;

export class FaroService {
  private instance: Faro | null = null;
  private registered: { faro: Faro; identity: FaroIdentity } | null = null;
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
    ...rest
  }: FaroServiceConfig): Faro {
    if (this.instance) {
      console.warn(`${LOG_PREFIX} FaroService already initialized`);
      return this.instance;
    }

    this.userBeforeSend = beforeSend;
    const identity = { faroUrl, faroKey, app: rest.app };

    if (this.registered) {
      this.warnAboutIgnoredChanges(this.registered.identity, identity);
      this.registered.faro.unpause();
      this.instance = this.registered.faro;
      return this.instance;
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

    this.registered = { faro, identity };
    this.instance = faro;
    return faro;
  }

  addSanitizer(sanitizer: Sanitizer | Sanitizer[]) {
    const newSanitizers = Array.isArray(sanitizer) ? sanitizer : [sanitizer];
    this.sanitizers = [...this.sanitizers, ...newSanitizers];
  }

  get isInitialized() {
    return this.instance !== null;
  }

  getInstance(): Faro {
    if (!this.instance) {
      throw new Error(`${LOG_PREFIX} Faro not initialized. Call init() first.`);
    }
    return this.instance;
  }

  destroy() {
    if (this.instance) {
      this.instance.pause();
      this.instance = null;
      this.sanitizers = [...DEFAULT_SANITIZERS];
    }
  }

  private sanitize(beacon: TransportItem): TransportItem | null {
    try {
      return this.sanitizers.reduce(
        (item, sanitize) => {
          const sanitized = sanitize(item);
          if (typeof sanitized !== 'object' || sanitized === null) {
            throw new TypeError('sanitizer returned no beacon');
          }
          return sanitized;
        },
        {
          ...beacon,
          meta: beacon.meta && JSON.parse(JSON.stringify(beacon.meta)),
        } as Record<string, any>,
      ) as TransportItem;
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

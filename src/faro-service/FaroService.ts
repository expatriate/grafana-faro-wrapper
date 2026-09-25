import {
  BrowserConfig,
  Faro,
  initializeFaro,
  Instrumentation,
  TransportItem,
} from '@grafana/faro-web-sdk';
import { OtlpHttpTransport } from '@grafana/faro-transport-otlp-http';
import { parseMetricLabels } from '../metrics-service/helpers/parseMetricLabels.ts';
import { MEASUREMENT_KEYS } from '../metrics-service/types.ts';
import { toLogfmt } from '../utils/logfmt.ts';
import { sanitizeEventUrlParams, sanitizePageUrlParams } from '../utils/sanitizers.ts';

export interface FaroConfig {
  faroUrl: string;
  faroKey: string;
}

export type Sanitizer = (beacon: Record<string, any>) => Record<string, any>;

type OtlpTransform = NonNullable<
  ConstructorParameters<typeof OtlpHttpTransport>[0]['otlpTransform']
>;

const DEFAULT_SANITIZERS: Sanitizer[] = [
  sanitizePageUrlParams,
  sanitizeEventUrlParams,
  parseMetricLabels,
];

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

export class FaroService {
  private instance: Faro | null = null;
  private registeredFaro: Faro | null = null;
  private sanitizers = [...DEFAULT_SANITIZERS];

  init({
    faroKey,
    faroUrl,
    transports = [],
    instrumentations = [],
    beforeSend,
    routerAdapter,
    ...rest
  }: FaroConfig & BrowserConfig & { routerAdapter?: Instrumentation }): Faro {
    if (this.instance) {
      console.warn('[Faro-react-wrapper] FaroService already initialized');
      return this.instance;
    }

    if (this.registeredFaro) {
      this.registeredFaro.unpause();
      this.instance = this.registeredFaro;
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
        const sanitized = this.sanitizers.reduce((item, sanitize) => sanitize(item), {
          ...beacon,
        } as Record<string, any>) as TransportItem;

        return beforeSend ? beforeSend(sanitized) : sanitized;
      },

      ...rest,
    });

    if (!faro) {
      throw new Error('[Faro-react-wrapper] Faro is already registered outside FaroService');
    }

    this.registeredFaro = faro;
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
      throw new Error('Faro not initialized. Call init() first.');
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
}

import {
  BrowserConfig,
  Faro,
  initializeFaro,
  MeasurementEvent,
  ReactIntegration,
  TransportItem,
} from '@grafana/faro-react';
import { OtlpHttpTransport } from '@grafana/faro-transport-otlp-http';
import {
  sanitizeContextLabelsValues,
  sanitizeEventUrlParams,
  sanitizePageUrlParams,
} from '../utils/satinizers.ts';

interface FaroConfig {
  faroUrl: string;
  faroKey: string;
}

type Sanitizer = (beacon: Record<string, any>) => Record<string, any>;

const DEFAULT_SANITIZERS: Sanitizer[] = [
  sanitizePageUrlParams,
  sanitizeEventUrlParams,
  sanitizeContextLabelsValues,
];

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
  }: FaroConfig & BrowserConfig & { routerAdapter?: ReactIntegration }): Faro {
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
          otlpTransform: this.createOtlpTransforms(),
        }),
        ...transports,
      ],

      instrumentations: [...(routerAdapter ? [routerAdapter] : []), ...instrumentations],

      beforeSend: (beacon) => {
        if (!this.sanitizers?.length) return beforeSend?.(beacon) ?? beacon;

        let beaconData: any = { ...beacon };

        this.sanitizers?.forEach((el) => {
          beaconData = { ...el(beaconData) };
        });

        return beforeSend?.(beaconData) ?? beaconData;
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

  private createOtlpTransforms(): {
    createErrorLogBody?: ((item: TransportItem<unknown>) => string) | undefined;
    createMeasurementLogBody?: (item: TransportItem<MeasurementEvent>) => string;
  } {
    return {
      createMeasurementLogBody(item) {
        const { payload } = item;
        const [name, value] = Object.entries(payload.values).flat();
        const result = payload.context?.result;

        return (
          `faro_signal=measurement type=${payload.type} name=${name} value=${value}` +
          (result ? ` result=${result}` : '')
        );
      },
      createErrorLogBody(item: any) {
        const { payload } = item;
        return `faro_signal=error type=${payload.type} message="${payload.value}"`;
      },
    };
  }

  destroy() {
    if (this.instance) {
      this.instance.pause();
      this.instance = null;
      this.sanitizers = [...DEFAULT_SANITIZERS];
    }
  }
}

import {
  BrowserConfig,
  deepEqual,
  Faro,
  initializeFaro,
  Instrumentation,
} from '@grafana/faro-web-sdk';
import { OtlpHttpTransport } from '@grafana/faro-transport-otlp-http';
import { OTLP_LOG_BODIES } from '../measurement/otlpLogBodies';
import { sendMeasurement } from '../measurement/sendMeasurement';
import { Metric } from '../measurement/types';
import { SloConfig, SloTracker, trackSlo } from '../slo/trackSlo';
import { LOG_PREFIX } from '../utils/logPrefix';
import { Sanitizer, SanitizerPipeline } from './SanitizerPipeline';

export interface FaroConfig {
  faroUrl: string;
  faroKey: string;
}

export type FaroServiceConfig = FaroConfig &
  Omit<BrowserConfig, 'url' | 'apiKey' | 'paused'> & {
    routerAdapter?: Instrumentation;
    enabled?: boolean;
  };

export type { Sanitizer } from './SanitizerPipeline';

type FaroIdentity = Pick<FaroServiceConfig, 'faroUrl' | 'faroKey' | 'app'>;

function warnAboutIgnoredChanges(initial: FaroIdentity, identity: FaroIdentity) {
  const changed = (Object.keys(identity) as (keyof FaroIdentity)[]).filter(
    (option) => !deepEqual(identity[option], initial[option]),
  );
  if (changed.length > 0) {
    console.warn(
      `${LOG_PREFIX} Faro cannot be re-initialized, changed options are ignored: ${changed.join(', ')}`,
    );
  }
}

type ServiceState =
  { kind: 'idle' } | { kind: 'active' | 'paused'; faro: Faro; identity: FaroIdentity };

export class FaroService {
  private state: ServiceState = { kind: 'idle' };
  private sanitizers = new SanitizerPipeline();
  private userBeforeSend: BrowserConfig['beforeSend'];

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
      warnAboutIgnoredChanges(this.state.identity, identity);
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
        const sanitized = this.sanitizers.run(beacon);
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
    this.sanitizers.add(Array.isArray(sanitizer) ? sanitizer : [sanitizer]);
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
    this.sanitizers.reset();
  }
}

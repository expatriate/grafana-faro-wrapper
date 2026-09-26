import {
  BrowserConfig,
  deepEqual,
  Faro,
  faro as registeredFaro,
  initializeFaro,
  Instrumentation,
  TransportItem,
} from '@grafana/faro-web-sdk';
import { OtlpHttpTransport } from '@grafana/faro-transport-otlp-http';
import { OTLP_LOG_BODIES } from '../measurement/otlpLogBodies';
import { sendMeasurement } from '../measurement/sendMeasurement';
import { Metric } from '../measurement/types';
import { inactiveTracker, SloConfig, SloTracker, trackSlo } from '../slo/trackSlo';
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

interface StartedFaro {
  faro: Faro;
  identity: FaroIdentity;
}

type PausedState = StartedFaro & { kind: 'paused' };

type ServiceState = { kind: 'idle' } | (StartedFaro & { kind: 'active' }) | PausedState;

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

function isFaroLoaded(): boolean {
  try {
    return typeof initializeFaro === 'function' && typeof OtlpHttpTransport === 'function';
  } catch {
    return false;
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown error';
}

export class FaroService {
  private state: ServiceState = { kind: 'idle' };
  private sanitizers = new SanitizerPipeline();
  private userBeforeSend: BrowserConfig['beforeSend'];

  init(config: FaroServiceConfig): Faro {
    if (this.state.kind === 'active') {
      console.warn(`${LOG_PREFIX} FaroService already initialized`);
      return this.state.faro;
    }
    this.userBeforeSend = config.beforeSend;
    return this.state.kind === 'paused' ? this.resume(this.state, config) : this.create(config);
  }

  addSanitizer(sanitizer: Sanitizer | Sanitizer[]) {
    const sanitizers = Array.isArray(sanitizer) ? sanitizer : [sanitizer];
    if (!sanitizers.every((item) => typeof item === 'function')) {
      throw new TypeError(`${LOG_PREFIX} addSanitizer expects a function or an array of functions`);
    }
    this.sanitizers.add(sanitizers);
  }

  sendMetric(metric: Metric) {
    try {
      sendMeasurement(this.getInstance(), metric);
    } catch (error) {
      console.warn(`${LOG_PREFIX} Failed to send metric:`, errorMessage(error));
    }
  }

  trackSlo<S extends string>(config: SloConfig<S>): SloTracker {
    try {
      return trackSlo((metric) => this.sendMetric(metric), config);
    } catch (error) {
      console.warn(`${LOG_PREFIX} Failed to track SLO:`, errorMessage(error));
      return inactiveTracker;
    }
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

  private resume(
    paused: PausedState,
    { faroUrl, faroKey, app, enabled = true }: FaroServiceConfig,
  ) {
    warnAboutIgnoredChanges(paused.identity, { faroUrl, faroKey, app });
    if (enabled) {
      paused.faro.unpause();
    }
    this.state = { ...paused, kind: 'active' };
    return paused.faro;
  }

  private create({
    faroKey,
    faroUrl,
    transports = [],
    instrumentations = [],
    routerAdapter,
    enabled = true,
    beforeSend,
    ...rest
  }: FaroServiceConfig): Faro {
    if (!isFaroLoaded()) {
      throw new Error(
        `${LOG_PREFIX} @grafana/faro-web-sdk and @grafana/faro-transport-otlp-http are not loaded: ` +
          'include their IIFE bundles before dist/index.umd.js or use dist/index.umd.full.js',
      );
    }
    const otlpTransport = new OtlpHttpTransport({
      apiKey: faroKey,
      logsURL: faroUrl,
      otlpTransform: OTLP_LOG_BODIES,
    });
    const faro = this.initializeOwnFaro(otlpTransport, {
      transports: [otlpTransport, ...transports],
      instrumentations: [...(routerAdapter ? [routerAdapter] : []), ...instrumentations],
      paused: !enabled,
      beforeSend: (beacon) => this.sanitize(beacon),
      ...rest,
    });
    this.state = { kind: 'active', faro, identity: { faroUrl, faroKey, app: rest.app } };
    return faro;
  }

  private initializeOwnFaro(otlpTransport: OtlpHttpTransport, config: BrowserConfig): Faro {
    let faro: Faro | undefined;
    try {
      faro = initializeFaro(config);
    } catch (error) {
      if (!registeredFaro.transports?.transports.includes(otlpTransport)) {
        throw error;
      }
      console.warn(`${LOG_PREFIX} Faro initialized with an error:`, errorMessage(error));
      return registeredFaro;
    }
    if (!faro) {
      throw new Error(
        `${LOG_PREFIX} Faro is already registered on this page by another FaroService or ` +
          'initializeFaro call; use a single FaroService per page',
      );
    }
    return faro;
  }

  private sanitize(beacon: TransportItem): TransportItem | null {
    const sanitized = this.sanitizers.run(beacon);
    if (!sanitized) {
      return null;
    }
    return this.userBeforeSend ? this.userBeforeSend(sanitized) : sanitized;
  }
}

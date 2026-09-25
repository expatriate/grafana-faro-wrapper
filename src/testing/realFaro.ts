import {
  BaseTransport,
  Faro,
  initializeFaro,
  InternalLoggerLevel,
  TransportItem,
  TransportItemType,
} from '@grafana/faro-core';
import { parseMetricLabels } from '../measurement/parseMetricLabels';

export function createRealFaro(): { faro: Faro; measurements: () => Record<string, any>[] } {
  const delivered: TransportItem[] = [];
  class CollectingTransport extends BaseTransport {
    readonly name = 'collecting';
    readonly version = '0';
    send(items: TransportItem | TransportItem[]) {
      delivered.push(...[items].flat());
    }
  }
  const faro = initializeFaro({
    app: { name: 'test' },
    batching: { enabled: false },
    beforeSend: parseMetricLabels,
    dedupe: true,
    globalObjectKey: 'faroMetricsTest',
    instrumentations: [],
    internalLoggerLevel: InternalLoggerLevel.OFF,
    isolate: true,
    metas: [],
    parseStacktrace: () => ({ frames: [] }),
    paused: false,
    preventGlobalExposure: true,
    transports: [new CollectingTransport()],
    unpatchedConsole: console,
  });
  return {
    faro,
    measurements: () =>
      delivered
        .filter((item) => item.type === TransportItemType.MEASUREMENT)
        .map((item) => item.payload),
  };
}

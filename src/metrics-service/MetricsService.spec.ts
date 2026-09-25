import {
  BaseTransport,
  initializeFaro,
  InternalLoggerLevel,
  TransportItem,
} from '@grafana/faro-core';
import { MetricsService } from './MetricsService.ts';
import { CustomMetricBase } from './types.ts';

function sendThroughRealFaro(...metrics: CustomMetricBase[]): TransportItem[] {
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
  const faroService: any = { getInstance: () => faro };

  metrics.forEach((metric) => new MetricsService(faroService).sendCustomMetric(metric));
  return delivered.filter((item) => item.type === 'measurement');
}

const click: CustomMetricBase = {
  name: 'user_action',
  value: 1,
  description: 'button click',
  unit: 'EVENTS',
  type: 'counter',
};

describe('MetricsService', () => {
  let pushMeasurement: jest.Mock;
  let service: MetricsService;

  beforeEach(() => {
    pushMeasurement = jest.fn();
    const fakeFaroService: any = { getInstance: () => ({ api: { pushMeasurement } }) };
    service = new MetricsService(fakeFaroService);
  });

  test('sends the value and metric description as measurement context', () => {
    service.sendCustomMetric({
      name: 'checkout',
      value: '42',
      description: 'checkout completed',
      unit: 'EVENTS',
      type: 'counter',
      labels: { step: 'payment' },
      result: 'success',
      buckets: [10, 100],
    });

    expect(pushMeasurement).toHaveBeenCalledWith(
      { type: 'custom', values: { checkout: 42 } },
      {
        context: {
          'measurement.description': 'checkout completed',
          'measurement.unit': 'EVENTS',
          'measurement.metric.type': 'counter',
          'measurement.labels': { step: 'payment' },
          'measurement.result': 'success',
          'measurement.buckets': '10,100',
        },
        skipDedupe: true,
      },
    );
  });

  test('delivers every identical metric instead of deduplicating repeats', () => {
    expect(sendThroughRealFaro(click, click)).toHaveLength(2);
  });

  test('stamps the measurement with the metric timestamp when one is given', () => {
    const eventTime = Date.UTC(2026, 0, 1);

    const [measurement] = sendThroughRealFaro({ ...click, timestamp: eventTime });

    expect((measurement.payload as { timestamp: string }).timestamp).toBe(
      '2026-01-01T00:00:00.000Z',
    );
  });

  test('converts non-numeric value to 0', () => {
    service.sendCustomMetric({ name: 'm', value: 'not-a-number' } as any);

    expect(pushMeasurement).toHaveBeenCalledWith(
      { type: 'custom', values: { m: 0 } },
      expect.anything(),
    );
  });

  test('catches errors from pushMeasurement and warns', () => {
    pushMeasurement.mockImplementation(() => {
      throw new Error('boom');
    });
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

    expect(() => service.sendCustomMetric({ name: 'm', value: 1 } as any)).not.toThrow();

    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });
});

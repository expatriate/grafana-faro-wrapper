import {
  BaseTransport,
  initializeFaro,
  InternalLoggerLevel,
  TransportItem,
} from '@grafana/faro-core';
import { MetricsService } from './MetricsService.ts';
import { CustomMetricBase } from './types.ts';

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
      timestamp: 0,
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
      globalObjectKey: 'faroDedupeTest',
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
    const click: CustomMetricBase = {
      timestamp: 0,
      name: 'user_action',
      value: 1,
      description: 'button click',
      unit: 'EVENTS',
      type: 'counter',
    };
    const realFaroService: any = { getInstance: () => faro };

    new MetricsService(realFaroService).sendCustomMetric(click);
    new MetricsService(realFaroService).sendCustomMetric(click);

    expect(delivered.filter((item) => item.type === 'measurement')).toHaveLength(2);
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

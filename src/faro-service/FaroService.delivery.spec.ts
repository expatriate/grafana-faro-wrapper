import {
  BaseTransport,
  InternalLoggerLevel,
  LogEvent,
  MeasurementEvent,
  TransportItem,
  TransportItemType,
} from '@grafana/faro-web-sdk';
import { FaroService, FaroServiceConfig } from './FaroService';

class CollectingTransport extends BaseTransport {
  readonly name = 'collecting';
  readonly version = '0';
  readonly items: TransportItem[] = [];

  send(items: TransportItem | TransportItem[]) {
    this.items.push(...[items].flat());
  }

  isBatched() {
    return true;
  }

  logs() {
    return this.items
      .filter((item) => item.type === TransportItemType.LOG)
      .map((item) => item.payload as LogEvent);
  }
}

const otlpBodies: string[] = [];
const FLUSH_MS = 300;

function config(collector: CollectingTransport, overrides: Partial<FaroServiceConfig> = {}) {
  return {
    faroUrl: 'https://collector.test/v1/logs',
    faroKey: 'key',
    app: { name: 'delivery-test' },
    transports: [collector],
    isolate: true,
    preventGlobalExposure: true,
    internalLoggerLevel: InternalLoggerLevel.OFF,
    ...overrides,
  } satisfies FaroServiceConfig;
}

const redactCards = (beacon: TransportItem) => {
  const log = beacon.payload as LogEvent;
  if (beacon.type === TransportItemType.LOG) {
    log.message = log.message.replace(/\d{4}( \d{4}){3}/, '[card]');
  }
  return beacon;
};

const markedBy = (label: string) => (beacon: TransportItem) => {
  const log = beacon.payload as LogEvent;
  if (beacon.type === TransportItemType.LOG) {
    log.context = { ...log.context, pipeline: label };
  }
  return beacon;
};

let warnSpy: jest.SpyInstance;

beforeEach(() => {
  jest.useFakeTimers();
  otlpBodies.length = 0;
  globalThis.fetch = jest.fn((_url, init?: RequestInit) => {
    otlpBodies.push(String(init?.body));
    return Promise.resolve({ ok: true, status: 200, headers: { get: () => null } } as never);
  });
  warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  jest.useRealTimers();
  warnSpy.mockRestore();
});

test('beacons captured before destroy leave after init with the sanitizers of their time', async () => {
  const collector = new CollectingTransport();
  const service = new FaroService();
  const faro = service.init(config(collector, { beforeSend: markedBy('first') }));
  service.addSanitizer(redactCards);

  faro.api.pushLog(['paid with 4111 1111 1111 1111']);
  jest.advanceTimersByTime(1);
  service.destroy();
  jest.advanceTimersByTime(1000);
  service.init(config(collector, { beforeSend: markedBy('second') }));
  jest.advanceTimersByTime(1);
  faro.api.pushLog(['after init']);
  await jest.advanceTimersByTimeAsync(FLUSH_MS);

  expect(collector.logs().map(({ message, context }) => [message, context?.pipeline])).toEqual([
    ['paid with [card]', 'first'],
    ['after init', 'second'],
  ]);
});

test('beforeSend throwing on one beacon drops it and keeps delivering the rest', async () => {
  const collector = new CollectingTransport();
  const faro = new FaroService().init(
    config(collector, {
      beforeSend: (beacon) => {
        if (beacon.type === TransportItemType.EXCEPTION) {
          throw new TypeError('user beforeSend bug');
        }
        return beacon;
      },
    }),
  );

  faro.api.pushError(new Error('page error'));
  faro.api.pushLog(['first']);
  await jest.advanceTimersByTimeAsync(FLUSH_MS);
  faro.api.pushLog(['second']);
  await jest.advanceTimersByTimeAsync(FLUSH_MS);

  expect(collector.logs().map(({ message }) => message)).toEqual(['first', 'second']);
  expect(collector.items.some((item) => item.type === TransportItemType.EXCEPTION)).toBe(false);
  expect(warnSpy).toHaveBeenCalledTimes(1);
});

test('metric labels reach OTLP as attributes and other transports in the Faro format', async () => {
  const collector = new CollectingTransport();
  const service = new FaroService();
  service.init(config(collector, { batching: { enabled: false } }));

  service.sendMetric({
    name: 'checkout',
    value: 1,
    unit: 'EVENTS',
    type: 'counter',
    labels: { payment: 'card', retries: 2, express: true },
  });
  await jest.advanceTimersByTimeAsync(FLUSH_MS);

  const [measurement] = collector.items.map((item) => item.payload as MeasurementEvent);
  expect(measurement.context?.['measurement.labels']).toBe(
    '{"payment":"card","retries":2,"express":true}',
  );
  const otlpLabels = JSON.parse(otlpBodies.join(''))
    .resourceLogs[0].scopeLogs[0].logRecords[0].attributes.find(
      (attribute: { key: string }) => attribute.key === 'faro.measurement.context',
    )
    .value.kvlistValue.values.find(
      (attribute: { key: string }) => attribute.key === 'measurement.labels',
    ).value.kvlistValue.values;
  expect(otlpLabels).toEqual([
    { key: 'payment', value: { stringValue: 'card' } },
    { key: 'retries', value: { intValue: 2 } },
    { key: 'express', value: { boolValue: true } },
  ]);
});

test('enabled: false delivers nothing until init turns sending on', async () => {
  const collector = new CollectingTransport();
  const service = new FaroService();
  const faro = service.init(config(collector, { enabled: false }));

  faro.api.pushLog(['while disabled']);
  await jest.advanceTimersByTimeAsync(FLUSH_MS);
  service.destroy();
  service.init(config(collector));
  faro.api.pushLog(['after enabling']);
  await jest.advanceTimersByTimeAsync(FLUSH_MS);

  expect(collector.logs().map(({ message }) => message)).toEqual(['after enabling']);
});

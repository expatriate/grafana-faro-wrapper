import { constructMetricContext } from '../measurement/constructMetricContext';
import { FaroService, FaroServiceConfig } from './FaroService';

jest.mock('@grafana/faro-web-sdk', () => ({
  ...jest.requireActual('@grafana/faro-web-sdk'),
  initializeFaro: jest.fn((cfg) => ({
    ...cfg,
    paused: cfg.paused ?? false,
    pause() {
      this.paused = true;
    },
    unpause() {
      this.paused = false;
    },
  })),
}));

jest.mock('@grafana/faro-transport-otlp-http', () => ({
  OtlpHttpTransport: jest.fn(function (opts: any) {
    (this as any).opts = opts;
  }),
}));

const faroWebSdk = jest.requireMock('@grafana/faro-web-sdk');
const { initializeFaro } = faroWebSdk;
const { OtlpHttpTransport } = jest.requireMock('@grafana/faro-transport-otlp-http');

function config(overrides: Partial<FaroServiceConfig> = {}): FaroServiceConfig {
  return { faroUrl: 'u', faroKey: 'k', app: { name: 'test' }, ...overrides };
}

describe('FaroService', () => {
  let warnSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  test('getInstance throws if not initialized', () => {
    const svc = new FaroService();
    expect(() => svc.getInstance()).toThrow('Faro not initialized. Call init() first.');
  });

  test('init sends logs to faroUrl with faroKey through the OTLP transport', () => {
    const svc = new FaroService();

    svc.init(config({ faroUrl: 'https://faro.test/ingest', faroKey: 'secret-key' }));

    expect(svc.isInitialized).toBe(true);
    expect((OtlpHttpTransport as jest.Mock).mock.calls[0][0]).toMatchObject({
      apiKey: 'secret-key',
      logsURL: 'https://faro.test/ingest',
    });
  });

  test('sendMetric warns instead of throwing when Faro is not initialized', () => {
    expect(() =>
      new FaroService().sendMetric({ name: 'm', value: 1, unit: 'EVENTS', type: 'counter' }),
    ).not.toThrow();

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('Failed to send metric'),
      expect.any(String),
    );
  });

  test('enabled: false starts Faro paused and keeps it paused after destroy and init', () => {
    const svc = new FaroService();
    const faro: any = svc.init(config({ enabled: false }));
    expect(faro.paused).toBe(true);

    svc.destroy();
    svc.init(config({ enabled: false }));

    expect(faro.paused).toBe(true);
    expect(svc.isInitialized).toBe(true);
  });

  test('puts the router instrumentation first and user transports after the OTLP one', () => {
    const routerAdapter: any = { name: 'router' };
    const userInstrumentation: any = { name: 'console' };
    const userTransport: any = { name: 'debug' };

    const faro: any = new FaroService().init(
      config({
        routerAdapter,
        instrumentations: [userInstrumentation],
        transports: [userTransport],
      }),
    );

    expect(faro.instrumentations).toEqual([routerAdapter, userInstrumentation]);
    expect(faro.transports).toHaveLength(2);
    expect(faro.transports[0]).toBeInstanceOf(OtlpHttpTransport);
    expect(faro.transports[1]).toBe(userTransport);
  });

  test('a second init warns and returns the same Faro instance', () => {
    const svc = new FaroService();
    const instance = svc.init(config());

    expect(svc.init(config())).toBe(instance);
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });

  test('the default pipeline cleans URLs of events and stack frames and parses metric labels', () => {
    const faro: any = new FaroService().init(config());
    const secretUrl = 'https://shop.test/orders/1234567?token=secret';

    const event = faro.beforeSend({
      type: 'event',
      meta: {},
      payload: { name: 'resource', attributes: { url: secretUrl, kind: 'img' } },
    });
    const exception = faro.beforeSend({
      type: 'exception',
      meta: {},
      payload: {
        type: 'Error',
        value: 'boom',
        stacktrace: { frames: [{ filename: secretUrl, function: '?', lineno: 1, colno: 1 }] },
      },
    });
    const measurement = faro.beforeSend({
      type: 'measurement',
      meta: {},
      payload: { type: 'custom', values: { m: 1 }, context: { 'measurement.labels': '{"a":1}' } },
    });

    expect(event.payload.attributes).toEqual({ url: 'shop.test/orders/:id', kind: 'img' });
    expect(exception.payload.stacktrace.frames[0].filename).toBe('shop.test/orders/:id');
    expect(measurement.payload.context['measurement.labels']).toEqual({ a: 1 });
  });

  test('beforeSend wrapper sanitizes the page URL and then calls the user beforeSend', () => {
    const svc = new FaroService();
    const userBeforeSend = jest.fn((b: any) => ({ ...b, fromUser: true }));

    svc.init(config({ beforeSend: userBeforeSend }));

    const wrapper = (svc.getInstance() as any).beforeSend;

    const beacon = {
      meta: { page: { url: 'https://example.com/path?accessToken=abc&other=1' } },
    };

    const result = wrapper(beacon);
    expect(userBeforeSend).toHaveBeenCalled();
    expect(result.meta.page.url).toBe('example.com/path');
    expect(result.fromUser).toBe(true);
  });

  test('a user beforeSend returning null drops the beacon', () => {
    const faro: any = new FaroService().init(config({ beforeSend: () => null }));

    expect(faro.beforeSend({ type: 'log', meta: {} })).toBeNull();
  });

  test('a sanitizer changing the beacon in place does not change what Faro keeps', () => {
    const svc = new FaroService();
    const faro: any = svc.init(config());
    svc.addSanitizer((beacon: any) => {
      beacon.meta.user.email = '[hidden]';
      beacon.payload.context.email = '[hidden]';
      return beacon;
    });
    const storedUser = { email: 'john@example.com' };
    const payload = { message: 'signed in', context: { email: 'john@example.com' } };

    const sent = faro.beforeSend({ type: 'log', meta: { user: storedUser }, payload });

    expect(sent.meta.user.email).toBe('[hidden]');
    expect(sent.payload.context.email).toBe('[hidden]');
    expect(storedUser.email).toBe('john@example.com');
    expect(payload.context.email).toBe('john@example.com');
  });

  test('user sanitizers run after the built-in ones, in the order they were added', () => {
    const svc = new FaroService();
    const faro: any = svc.init(config());
    const seen: string[] = [];
    svc.addSanitizer([
      (beacon) => {
        seen.push(beacon.meta.page!.url!);
        return beacon;
      },
      (beacon) => ({ ...beacon, meta: { ...beacon.meta, page: { url: 'second' } } }),
    ]);

    const sent = faro.beforeSend({ type: 'log', meta: { page: { url: 'https://a.test/x?t=1' } } });

    expect(seen).toEqual(['a.test/x']);
    expect(sent.meta.page.url).toBe('second');
  });

  test('addSanitizer rejects something that is not a function right away', () => {
    const svc = new FaroService();
    svc.init(config());

    expect(() => svc.addSanitizer(undefined as any)).toThrow(TypeError);
    expect(() => svc.addSanitizer([(beacon) => beacon, {} as any])).toThrow(TypeError);
  });

  test('drops only beacons a sanitizer throws on and warns once', () => {
    const svc = new FaroService();
    const faro: any = svc.init(config());
    svc.addSanitizer((beacon) => {
      if (beacon.type === 'exception') throw new Error('boom');
      return beacon;
    });

    const dropped = [
      faro.beforeSend({ type: 'exception', meta: {} }),
      faro.beforeSend({ type: 'exception', meta: {} }),
    ];
    const kept = faro.beforeSend({ type: 'log', meta: {} });

    expect(dropped).toEqual([null, null]);
    expect(kept).toMatchObject({ type: 'log' });
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });

  test('warns when a sanitizer forgets to return the beacon', () => {
    const svc = new FaroService();
    const faro: any = svc.init(config());
    svc.addSanitizer(((beacon: any) => {
      beacon.meta.user = undefined;
    }) as any);

    expect(faro.beforeSend({ type: 'log', meta: { user: { id: '1' } } })).toBeNull();
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });

  describe('OTLP log body', () => {
    function initTransforms() {
      new FaroService().init(config());
      return (OtlpHttpTransport as jest.Mock).mock.calls[0][0].otlpTransform;
    }

    test('includes the result of a custom metric', () => {
      const context = constructMetricContext({
        description: 'checkout completed',
        unit: 'EVENTS',
        type: 'counter',
        result: 'success',
      });

      const body = initTransforms().createMeasurementLogBody({
        payload: { type: 'custom', values: { checkout: 1 }, context },
      });

      expect(body).toBe('faro_signal=measurement type=custom name=checkout value=1 result=success');
    });

    test('keeps every value of a multi-value measurement', () => {
      const body = initTransforms().createMeasurementLogBody({
        payload: { type: 'web-vitals', values: { lcp: 1200, delta: 50 } },
      });

      expect(body).toBe(
        'faro_signal=measurement type=web-vitals name=lcp value=1200 value_delta=50',
      );
    });

    test('escapes quotes and line breaks in an error message', () => {
      const body = initTransforms().createErrorLogBody({
        payload: { type: 'SyntaxError', value: 'Unexpected "token"\n  at parse (app.js:1)' },
      });

      expect(body).toBe(
        'faro_signal=error type=SyntaxError message="Unexpected \\"token\\"\\n  at parse (app.js:1)"',
      );
    });

    test('quotes a metric name containing spaces', () => {
      const body = initTransforms().createMeasurementLogBody({
        payload: { type: 'custom', values: { 'page load': 5 } },
      });

      expect(body).toBe('faro_signal=measurement type=custom name="page load" value=5');
    });
  });

  test('destroy leaves the service uninitialized', () => {
    const svc = new FaroService();
    svc.init(config());
    expect(svc.isInitialized).toBe(true);
    svc.destroy();
    expect(svc.isInitialized).toBe(false);
    expect(() => svc.getInstance()).toThrow();
  });

  test('destroy stops sending and init resumes the same Faro instance', () => {
    const svc = new FaroService();
    const faro: any = svc.init(config());

    svc.destroy();
    expect(faro.paused).toBe(true);

    const resumed = svc.init(config());
    expect(resumed).toBe(faro);
    expect(faro.paused).toBe(false);
    expect(svc.getInstance()).toBe(faro);
  });

  test('init after destroy applies the new beforeSend', () => {
    const svc = new FaroService();
    const faro: any = svc.init(config({ beforeSend: (beacon) => beacon }));
    svc.destroy();

    svc.init(config({ beforeSend: () => null }));

    expect(faro.beforeSend({ type: 'log', meta: {} })).toBeNull();
  });

  test('init after destroy warns about options Faro cannot change and only about them', () => {
    const svc = new FaroService();
    svc.init(config({ app: { name: 'shop', version: '1' } }));

    svc.destroy();
    svc.init(config({ app: { version: '1', name: 'shop' } }));
    expect(warnSpy).not.toHaveBeenCalled();

    svc.destroy();
    svc.init(config({ faroKey: 'k2', app: { name: 'admin' } }));
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('faroKey, app'));
  });

  test('after destroy and init the built-in sanitizers stay and user ones are dropped', () => {
    const svc = new FaroService();
    const faro: any = svc.init(config());
    svc.addSanitizer(() => {
      throw new Error('boom');
    });

    svc.destroy();
    svc.init(config());
    const beacon = faro.beforeSend({
      meta: { page: { url: 'https://example.com/users/1234567?accessToken=secret' } },
    });

    expect(beacon.meta.page.url).toBe('example.com/users/:id');
  });

  test('a failing sanitizer added after destroy and init warns again', () => {
    const svc = new FaroService();
    const faro: any = svc.init(config());
    const failing = () => {
      throw new Error('boom');
    };
    svc.addSanitizer(failing);
    faro.beforeSend({ type: 'log', meta: {} });

    svc.destroy();
    svc.init(config());
    svc.addSanitizer(failing);
    faro.beforeSend({ type: 'log', meta: {} });

    expect(warnSpy).toHaveBeenCalledTimes(2);
  });

  test('a second service on the page explains that Faro is already registered', () => {
    initializeFaro.mockReturnValueOnce(undefined);
    const svc = new FaroService();

    expect(() => svc.init(config())).toThrow(/single FaroService per page/);
    expect(svc.isInitialized).toBe(false);
  });

  test('keeps working with its own Faro when initialization throws after registration', () => {
    initializeFaro.mockImplementationOnce((cfg: any) => {
      faroWebSdk.faro = { ...cfg, transports: { transports: cfg.transports } };
      throw new TypeError('instrumentation failed');
    });
    const svc = new FaroService();

    const faro = svc.init(config());

    expect(faro).toBe(faroWebSdk.faro);
    expect(svc.isInitialized).toBe(true);
    expect(warnSpy).toHaveBeenCalledWith(expect.any(String), 'instrumentation failed');
  });

  test('rethrows an initialization error when the registered Faro is not its own', () => {
    initializeFaro.mockImplementationOnce(() => {
      throw new TypeError('bad config');
    });

    expect(() => new FaroService().init(config())).toThrow('bad config');
  });

  test('trackSlo reports the metric through sendMetric and never throws', () => {
    const svc = new FaroService();
    const faro: any = svc.init(config());
    faro.api = { pushMeasurement: jest.fn() };

    svc.trackSlo({ name: 'page_ready', failTime: 1000, steps: { render: () => true } });
    const broken = svc.trackSlo({ name: 'broken', failTime: 1000, steps: undefined as any });

    expect(faro.api.pushMeasurement).toHaveBeenCalledWith(
      { type: 'custom', values: { page_ready: expect.any(Number) } },
      expect.objectContaining({ skipDedupe: true }),
    );
    expect(broken.state).toBe('disposed');
  });
});

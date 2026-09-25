import { constructMetricContext } from '../metrics-service/helpers/constructMetricContext.ts';
import { FaroService } from './FaroService.ts';

jest.mock('@grafana/faro-web-sdk', () => ({
  ...jest.requireActual('@grafana/faro-web-sdk'),
  initializeFaro: jest.fn((cfg) => ({
    ...cfg,
    paused: false,
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

const { initializeFaro } = jest.requireMock('@grafana/faro-web-sdk');
const { OtlpHttpTransport } = jest.requireMock('@grafana/faro-transport-otlp-http');

describe('FaroService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('getInstance throws if not initialized', () => {
    const svc = new FaroService();
    expect(() => svc.getInstance()).toThrow('Faro not initialized. Call init() first.');
  });

  test('init initializes instance, creates OtlpHttpTransport with correct options and is idempotent', () => {
    const svc = new FaroService();
    const userBeforeSend = jest.fn((b: any) => ({ ...b, userWrapped: true }));

    const config: any = {
      faroUrl: 'https://faro.test/ingest',
      faroKey: 'secret-key',
      beforeSend: userBeforeSend,
    };

    const instance = svc.init(config);

    expect(initializeFaro).toHaveBeenCalled();
    expect(svc.isInitialized).toBe(true);
    expect(svc.getInstance()).toBeDefined();

    const otlpOpts = (OtlpHttpTransport as jest.Mock).mock.calls[0][0];
    expect(otlpOpts.apiKey).toBe(config.faroKey);
    expect(otlpOpts.logsURL).toBe(config.faroUrl);

    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const same = svc.init(config);
    expect(warnSpy).toHaveBeenCalled();
    expect(same).toBe(instance);
    warnSpy.mockRestore();
  });

  test('beforeSend wrapper sanitizes the page URL and then calls the user beforeSend', () => {
    const svc = new FaroService();
    const userBeforeSend = jest.fn((b: any) => ({ ...b, fromUser: true }));

    svc.init({
      faroUrl: 'https://x',
      faroKey: 'k',
      beforeSend: userBeforeSend,
    } as any);

    const inst: any = svc.getInstance();
    const wrapper = inst.beforeSend;
    expect(typeof wrapper).toBe('function');

    const beacon = {
      meta: { page: { url: 'https://example.com/path?accessToken=abc&other=1' } },
    };

    const result = wrapper(beacon);
    expect(userBeforeSend).toHaveBeenCalled();
    expect(result.meta.page.url).toBe('example.com/path');
    expect(result.fromUser).toBe(true);
  });

  test('a user beforeSend returning null drops the beacon', () => {
    const faro: any = new FaroService().init({
      faroUrl: 'u',
      faroKey: 'k',
      beforeSend: () => null,
    } as any);

    expect(faro.beforeSend({ type: 'log', meta: {} })).toBeNull();
  });

  test('a sanitizer changing the beacon in place does not change meta Faro keeps', () => {
    const svc = new FaroService();
    const faro: any = svc.init({ faroUrl: 'u', faroKey: 'k' } as any);
    svc.addSanitizer((beacon) => {
      beacon.meta.user.email = '[hidden]';
      return beacon;
    });
    const storedUser = { email: 'john@example.com' };

    const sent = faro.beforeSend({ type: 'log', meta: { user: storedUser } });

    expect(sent.meta.user.email).toBe('[hidden]');
    expect(storedUser.email).toBe('john@example.com');
  });

  test('sanitizes beacons in browsers without structuredClone', () => {
    const { structuredClone } = globalThis;
    Reflect.deleteProperty(globalThis, 'structuredClone');
    try {
      const faro: any = new FaroService().init({ faroUrl: 'u', faroKey: 'k' } as any);

      const sent = faro.beforeSend({ meta: { page: { url: 'https://a.com/orders/1234567?t=1' } } });

      expect(sent.meta.page.url).toBe('a.com/orders/:id');
    } finally {
      globalThis.structuredClone = structuredClone;
    }
  });

  test('drops only beacons a sanitizer throws on and warns once', () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const svc = new FaroService();
    const faro: any = svc.init({ faroUrl: 'u', faroKey: 'k' } as any);
    svc.addSanitizer((beacon) => {
      if (beacon.type === 'exception') throw new Error('boom');
      return beacon;
    });

    const dropped = [
      faro.beforeSend({ type: 'exception' }),
      faro.beforeSend({ type: 'exception' }),
    ];
    const kept = faro.beforeSend({ type: 'log' });

    expect(dropped).toEqual([null, null]);
    expect(kept).toMatchObject({ type: 'log' });
    expect(warnSpy).toHaveBeenCalledTimes(1);
    warnSpy.mockRestore();
  });

  describe('OTLP log body', () => {
    function initTransforms() {
      new FaroService().init({ faroUrl: 'u', faroKey: 'k' } as any);
      return (OtlpHttpTransport as jest.Mock).mock.calls[0][0].otlpTransform;
    }

    test('includes the result of a metric sent through MetricsService', () => {
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
    svc.init({ faroUrl: 'u', faroKey: 'k' } as any);
    expect(svc.isInitialized).toBe(true);
    svc.destroy();
    expect(svc.isInitialized).toBe(false);
    expect(() => svc.getInstance()).toThrow();
  });

  test('destroy stops sending and init resumes the same Faro instance', () => {
    const svc = new FaroService();
    const faro: any = svc.init({ faroUrl: 'u', faroKey: 'k' } as any);

    svc.destroy();
    expect(faro.paused).toBe(true);

    const resumed = svc.init({ faroUrl: 'u', faroKey: 'k' } as any);
    expect(resumed).toBe(faro);
    expect(faro.paused).toBe(false);
    expect(svc.getInstance()).toBe(faro);
  });

  test('init after destroy applies the new beforeSend', () => {
    const svc = new FaroService();
    const faro: any = svc.init({ faroUrl: 'u', faroKey: 'k', beforeSend: (b: any) => b } as any);
    svc.destroy();

    svc.init({ faroUrl: 'u', faroKey: 'k', beforeSend: () => null } as any);

    expect(faro.beforeSend({ type: 'log', meta: {} })).toBeNull();
  });

  test('init after destroy warns about options Faro cannot change and only about them', () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const svc = new FaroService();
    svc.init({ faroUrl: 'u', faroKey: 'k', app: { name: 'shop', version: '1' } } as any);

    svc.destroy();
    svc.init({ faroUrl: 'u', faroKey: 'k', app: { version: '1', name: 'shop' } } as any);
    expect(warnSpy).not.toHaveBeenCalled();

    svc.destroy();
    svc.init({ faroUrl: 'u', faroKey: 'k2', app: { name: 'admin' } } as any);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('faroKey, app'));
    warnSpy.mockRestore();
  });

  test('destroy keeps default URL sanitization for beacons Faro still produces', () => {
    const svc = new FaroService();
    const faro: any = svc.init({ faroUrl: 'u', faroKey: 'k' } as any);

    svc.destroy();
    const beacon = faro.beforeSend({
      meta: { page: { url: 'https://example.com/users/1234567?accessToken=secret' } },
    });

    expect(beacon.meta.page.url).toBe('example.com/users/:id');
  });

  test('init throws when Faro is already registered outside the service', () => {
    initializeFaro.mockReturnValueOnce(undefined);
    const svc = new FaroService();

    expect(() => svc.init({ faroUrl: 'u', faroKey: 'k' } as any)).toThrow(/already registered/);
    expect(svc.isInitialized).toBe(false);
  });
});

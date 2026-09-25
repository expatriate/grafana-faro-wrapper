import { FaroService } from './FaroService.ts';

jest.mock('@grafana/faro-react', () => ({
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
  getWebInstrumentations: jest.fn(() => []),
}));

jest.mock('@grafana/faro-transport-otlp-http', () => ({
  OtlpHttpTransport: jest.fn(function (opts: any) {
    (this as any).opts = opts;
  }),
}));

const { initializeFaro } = jest.requireMock('@grafana/faro-react');
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

    // initializeFaro должен быть вызван
    expect(initializeFaro).toHaveBeenCalled();

    // экземпляр возвращён и помечен как инициализированный
    expect(svc.isInitialized).toBe(true);
    expect(svc.getInstance()).toBeDefined();

    // OtlpHttpTransport был вызван с ожидаемыми опциями
    expect((OtlpHttpTransport as jest.Mock).mock.calls.length).toBeGreaterThanOrEqual(1);
    const otlpOpts = (OtlpHttpTransport as jest.Mock).mock.calls[0][0];
    expect(otlpOpts.apiKey).toBe(config.faroKey);
    expect(otlpOpts.logsURL).toBe(config.faroUrl);
    expect(typeof otlpOpts.otlpTransform).toBe(
      'object' /* функция/объект трансформаций ожидается */,
    );

    // повторный вызов init не должен создавать новый экземпляр, а должен предупредить
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const same = svc.init(config);
    expect(warnSpy).toHaveBeenCalled();
    expect(same).toBe(instance);
    warnSpy.mockRestore();
  });

  test('beforeSend wrapper санитизирует URL и вызывает пользовательский beforeSend', () => {
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
    // пользовательская beforeSend вызвана
    expect(userBeforeSend).toHaveBeenCalled();
    // URL должен быть замаскирован
    expect(result.meta.page.url).not.toContain('accessToken=abc');
    // другие параметры сохранены
    expect(result.meta.page.url).not.toContain('other=1');
    // пользовательская модификация возвращаемого значения прошла через wrapper
    expect(result.fromUser).toBe(true);
  });

  test('createOtlpTransforms формирует корректную строку для измерений и ошибок', () => {
    const svc = new FaroService();
    // доступ к приватному методу через any
    const transforms = (svc as any).createOtlpTransforms();
    expect(typeof transforms.createMeasurementLogBody).toBe('function');
    expect(typeof transforms.createErrorLogBody).toBe('function');

    const measurement = transforms.createMeasurementLogBody({
      payload: { type: 'custom', values: { my_metric: 123 }, context: { result: 'ok' } },
    } as any);
    expect(measurement).toContain('faro_signal=measurement');
    expect(measurement).toContain('name=my_metric');
    expect(measurement).toContain('value=123');
    expect(measurement).toContain('result=ok');

    const error = transforms.createErrorLogBody({
      payload: { type: 'error', value: 'some error message' },
    } as any);
    expect(error).toContain('faro_signal=error');
    expect(error).toContain('message="some error message"');
  });

  test('destroy сбрасывает состояние', () => {
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

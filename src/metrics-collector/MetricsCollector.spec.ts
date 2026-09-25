import { MetricsCollector } from './MetricsCollector.ts';

const CHECK_INTERVAL = 100;

type Step = 'render' | 'data';

function createCollector(steps: Step[] = ['render', 'data'], failTime?: number) {
  const onSuccess = jest.fn();
  const onFail = jest.fn();
  const collector = new MetricsCollector<Step>({ steps, failTime, onSuccess, onFail });
  return { collector, onSuccess, onFail };
}

function deferredCheck() {
  let resolve!: (passed: boolean) => void;
  const promise = new Promise<boolean>((r) => (resolve = r));
  return { check: () => promise, resolve };
}

const advance = (ms: number) => jest.advanceTimersByTimeAsync(ms);

describe('MetricsCollector', () => {
  beforeEach(() => {
    jest.useFakeTimers({ doNotFake: ['queueMicrotask'] });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('reports success with every step passed once all checks pass', async () => {
    const { collector, onSuccess, onFail } = createCollector();

    collector.addMetricStep('render', () => true);
    collector.addMetricStep('data', async () => true);
    await advance(CHECK_INTERVAL);

    expect(onSuccess).toHaveBeenCalledTimes(1);
    expect(onSuccess).toHaveBeenCalledWith({
      timestamp: expect.any(Number),
      duration: CHECK_INTERVAL,
      steps: { render: true, data: true },
    });
    expect(onFail).not.toHaveBeenCalled();
  });

  test('reports failure when a check returns false', async () => {
    const { collector, onSuccess, onFail } = createCollector();

    collector.addMetricStep('render', () => true);
    collector.addMetricStep('data', () => false);
    await advance(CHECK_INTERVAL);

    expect(onFail).toHaveBeenCalledWith(
      expect.objectContaining({ steps: { render: true, data: false } }),
    );
    expect(onSuccess).not.toHaveBeenCalled();
  });

  test('treats throwing and rejecting checks as failed steps', async () => {
    const { collector, onFail } = createCollector();

    collector.addMetricStep('render', () => {
      throw new Error('boom');
    });
    collector.addMetricStep('data', () => Promise.reject(new Error('boom')));
    await advance(CHECK_INTERVAL);

    expect(onFail).toHaveBeenCalledWith(
      expect.objectContaining({ steps: { render: false, data: false } }),
    );
  });

  test('treats a throwing readiness condition as a failed step', async () => {
    const { collector, onFail } = createCollector();

    collector.addMetricStep('render', () => true);
    collector.addMetricStep(
      'data',
      () => true,
      () => {
        throw new Error('boom');
      },
    );
    await advance(CHECK_INTERVAL);

    expect(onFail).toHaveBeenCalledWith(
      expect.objectContaining({ steps: { render: true, data: false } }),
    );
  });

  test('a reset right after a finishing resume does not break the next run', async () => {
    const { collector, onSuccess } = createCollector(['render'], 1000);
    const render = deferredCheck();
    collector.addMetricStep('render', render.check);
    await advance(CHECK_INTERVAL);
    collector.pause();
    render.resolve(true);
    await advance(0);

    collector.resume();
    collector.reset();
    collector.addMetricStep('render', () => true);
    await advance(CHECK_INTERVAL);

    expect(onSuccess).toHaveBeenCalledTimes(1);
    expect(onSuccess).toHaveBeenCalledWith(expect.objectContaining({ steps: { render: true } }));
    expect(collector.getStatus()).toMatchObject({ isRunning: false, isDone: true });
  });

  test('status time stands still while paused and after the run finishes', async () => {
    const { collector } = createCollector(['render', 'data'], 1000);
    collector.addMetricStep('render', () => true);
    await advance(200);

    collector.pause();
    const paused = collector.getStatus();
    await advance(500);
    expect(collector.getStatus()).toMatchObject({
      runningTime: paused.runningTime,
      remainingTime: paused.remainingTime,
    });

    collector.resume();
    await advance(1000);
    const finished = collector.getStatus();
    await advance(500);
    expect(collector.getStatus().runningTime).toBe(finished.runningTime);
    expect(finished.runningTime).toBe(1000);
  });

  test('fails with pending steps as false when failTime elapses', async () => {
    const { collector, onFail } = createCollector(['render', 'data'], 1000);

    collector.addMetricStep('render', () => true);
    await advance(1000);

    expect(onFail).toHaveBeenCalledWith(
      expect.objectContaining({ duration: 1000, steps: { render: true, data: false } }),
    );
  });

  test('waits for the readiness condition before evaluating a step', async () => {
    const { collector, onSuccess } = createCollector(['render']);
    let ready = false;

    collector.addMetricStep('render', () => true, () => ready);
    await advance(CHECK_INTERVAL * 5);
    expect(onSuccess).not.toHaveBeenCalled();

    ready = true;
    await advance(CHECK_INTERVAL);
    expect(onSuccess).toHaveBeenCalledWith(expect.objectContaining({ steps: { render: true } }));
  });

  test('reports a single outcome when failTime elapses after success', async () => {
    const { collector, onSuccess, onFail } = createCollector(['render'], 1000);

    collector.addMetricStep('render', () => true);
    await advance(2000);

    expect(onSuccess).toHaveBeenCalledTimes(1);
    expect(onFail).not.toHaveBeenCalled();
  });

  test('pause stops the failTime clock and is excluded from duration', async () => {
    const { collector, onFail } = createCollector(['render', 'data'], 1000);

    collector.addMetricStep('render', () => true);
    await advance(500);
    collector.pause();
    await advance(5000);
    collector.resume();
    await advance(499);
    expect(onFail).not.toHaveBeenCalled();

    await advance(1);
    expect(onFail).toHaveBeenCalledWith(expect.objectContaining({ duration: 1000 }));
  });

  test('evaluates a result that arrived while paused once resumed', async () => {
    const { collector, onSuccess } = createCollector(['render']);
    const render = deferredCheck();

    collector.addMetricStep('render', render.check);
    await advance(CHECK_INTERVAL);
    collector.pause();
    render.resolve(true);
    await advance(0);
    collector.resume();
    await advance(CHECK_INTERVAL);

    expect(onSuccess).toHaveBeenCalledWith(expect.objectContaining({ steps: { render: true } }));
  });

  test('ignores results of checks started before reset', async () => {
    const { collector, onSuccess, onFail } = createCollector(['render']);
    const staleRender = deferredCheck();

    collector.addMetricStep('render', staleRender.check);
    await advance(CHECK_INTERVAL);
    collector.reset();
    staleRender.resolve(true);
    await advance(0);
    expect(onSuccess).not.toHaveBeenCalled();

    collector.addMetricStep('render', () => false);
    await advance(CHECK_INTERVAL);

    expect(onSuccess).not.toHaveBeenCalled();
    expect(onFail).toHaveBeenCalledWith(expect.objectContaining({ steps: { render: false } }));
  });

  test('does not start a step check again while the previous one is in progress', async () => {
    const { collector } = createCollector(['render']);
    const slowCheck = jest.fn(() => new Promise<boolean>(() => {}));

    collector.addMetricStep('render', slowCheck);
    await advance(CHECK_INTERVAL * 10);

    expect(slowCheck).toHaveBeenCalledTimes(1);
  });
});

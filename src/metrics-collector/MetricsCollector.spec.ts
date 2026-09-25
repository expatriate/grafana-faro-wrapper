import { MetricsCollector, STEP_CHECK_INTERVAL_MS } from './MetricsCollector.ts';

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

  test('checks steps as soon as they are registered, without waiting for an interval', async () => {
    const { collector, onSuccess, onFail } = createCollector();

    collector.addStep('render', () => true);
    collector.addStep('data', async () => true);
    await advance(0);

    expect(onSuccess).toHaveBeenCalledTimes(1);
    expect(onSuccess).toHaveBeenCalledWith({
      timestamp: expect.any(Number),
      duration: 0,
      steps: { render: true, data: true },
    });
    expect(onFail).not.toHaveBeenCalled();
  });

  test('reports failure when a check returns false', async () => {
    const { collector, onSuccess, onFail } = createCollector();

    collector.addStep('render', () => true);
    collector.addStep('data', () => false);
    await advance(STEP_CHECK_INTERVAL_MS);

    expect(onFail).toHaveBeenCalledWith(
      expect.objectContaining({ steps: { render: true, data: false } }),
    );
    expect(onSuccess).not.toHaveBeenCalled();
  });

  test('treats throwing and rejecting checks as failed steps', async () => {
    const { collector, onFail } = createCollector();

    collector.addStep('render', () => {
      throw new Error('boom');
    });
    collector.addStep('data', () => Promise.reject(new Error('boom')));
    await advance(STEP_CHECK_INTERVAL_MS);

    expect(onFail).toHaveBeenCalledWith(
      expect.objectContaining({ steps: { render: false, data: false } }),
    );
  });

  test('treats a throwing readiness condition as a failed step', async () => {
    const { collector, onFail } = createCollector();

    collector.addStep('render', () => true);
    collector.addStep(
      'data',
      () => true,
      () => {
        throw new Error('boom');
      },
    );
    await advance(STEP_CHECK_INTERVAL_MS);

    expect(onFail).toHaveBeenCalledWith(
      expect.objectContaining({ steps: { render: true, data: false } }),
    );
  });

  test('a reset right after a finishing resume does not break the next run', async () => {
    const { collector, onSuccess } = createCollector(['render'], 1000);
    const render = deferredCheck();
    collector.addStep('render', render.check);
    await advance(STEP_CHECK_INTERVAL_MS);
    collector.pause();
    render.resolve(true);
    await advance(0);

    collector.resume();
    collector.reset();
    collector.addStep('render', () => true);
    await advance(STEP_CHECK_INTERVAL_MS);

    expect(onSuccess).toHaveBeenCalledTimes(1);
    expect(onSuccess).toHaveBeenCalledWith(expect.objectContaining({ steps: { render: true } }));
    expect(collector.getStatus().state).toBe('done');
  });

  test('status time stands still while paused and after the run finishes', async () => {
    const { collector } = createCollector(['render', 'data'], 1000);
    collector.addStep('render', () => true);
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

  test('status reports the run state through the whole lifecycle', async () => {
    const { collector } = createCollector(['render']);
    const render = deferredCheck();
    const states = [collector.getStatus().state];

    collector.addStep('render', render.check);
    states.push(collector.getStatus().state);
    collector.pause();
    states.push(collector.getStatus().state);
    render.resolve(true);
    await advance(0);
    collector.resume();
    states.push(collector.getStatus().state);
    await advance(0);
    states.push(collector.getStatus().state);

    expect(states).toEqual(['idle', 'running', 'paused', 'finishing', 'done']);
  });

  test('fails with pending steps as false when failTime elapses', async () => {
    const { collector, onFail } = createCollector(['render', 'data'], 1000);

    collector.addStep('render', () => true);
    await advance(1000);

    expect(onFail).toHaveBeenCalledWith(
      expect.objectContaining({ duration: 1000, steps: { render: true, data: false } }),
    );
  });

  test('waits for the readiness condition before evaluating a step', async () => {
    const { collector, onSuccess } = createCollector(['render']);
    let ready = false;

    collector.addStep(
      'render',
      () => true,
      () => ready,
    );
    await advance(STEP_CHECK_INTERVAL_MS * 5);
    expect(onSuccess).not.toHaveBeenCalled();

    ready = true;
    await advance(STEP_CHECK_INTERVAL_MS);
    expect(onSuccess).toHaveBeenCalledWith(expect.objectContaining({ steps: { render: true } }));
  });

  test('reports a single outcome when failTime elapses after success', async () => {
    const { collector, onSuccess, onFail } = createCollector(['render'], 1000);

    collector.addStep('render', () => true);
    await advance(2000);

    expect(onSuccess).toHaveBeenCalledTimes(1);
    expect(onFail).not.toHaveBeenCalled();
  });

  test('pause stops the failTime clock and is excluded from duration', async () => {
    const { collector, onFail } = createCollector(['render', 'data'], 1000);

    collector.addStep('render', () => true);
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

    collector.addStep('render', render.check);
    await advance(STEP_CHECK_INTERVAL_MS);
    collector.pause();
    render.resolve(true);
    await advance(0);
    collector.resume();
    await advance(STEP_CHECK_INTERVAL_MS);

    expect(onSuccess).toHaveBeenCalledWith(expect.objectContaining({ steps: { render: true } }));
  });

  test('ignores results of checks started before reset', async () => {
    const { collector, onSuccess, onFail } = createCollector(['render']);
    const staleRender = deferredCheck();

    collector.addStep('render', staleRender.check);
    await advance(STEP_CHECK_INTERVAL_MS);
    collector.reset();
    staleRender.resolve(true);
    await advance(0);
    expect(onSuccess).not.toHaveBeenCalled();

    collector.addStep('render', () => false);
    await advance(STEP_CHECK_INTERVAL_MS);

    expect(onSuccess).not.toHaveBeenCalled();
    expect(onFail).toHaveBeenCalledWith(expect.objectContaining({ steps: { render: false } }));
  });

  test('does not start a step check again while the previous one is in progress', async () => {
    const { collector } = createCollector(['render']);
    const slowCheck = jest.fn(() => new Promise<boolean>(() => {}));

    collector.addStep('render', slowCheck);
    await advance(STEP_CHECK_INTERVAL_MS * 10);

    expect(slowCheck).toHaveBeenCalledTimes(1);
  });
});

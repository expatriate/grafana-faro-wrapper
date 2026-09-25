import { SloRun, SloRunConfig, STEP_CHECK_INTERVAL_MS } from './SloRun';

type Step = 'render' | 'data';

function startRun(config: Partial<SloRunConfig<Step>> & Pick<SloRunConfig<Step>, 'steps'>): {
  run: SloRun<Step>;
  onFinish: jest.Mock;
} {
  const onFinish = jest.fn();
  const run = new SloRun<Step>({ failTime: 10_000, onFinish, ...config });
  return { run, onFinish };
}

function deferred() {
  let resolve!: (passed: boolean) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<boolean>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const afterTicks = (count: number) => jest.advanceTimersByTimeAsync(count * STEP_CHECK_INTERVAL_MS);

beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

test('passes a step once its check turns true and reports the moment it did', async () => {
  let rendered = false;
  const { onFinish } = startRun({ steps: { render: () => rendered, data: () => true } });

  await afterTicks(2);
  rendered = true;
  await afterTicks(1);

  expect(onFinish).toHaveBeenCalledTimes(1);
  expect(onFinish).toHaveBeenCalledWith({
    timestamp: expect.any(Number),
    duration: 3 * STEP_CHECK_INTERVAL_MS,
    passed: true,
    steps: { render: true, data: true },
  });
});

test('fails a step past its own deadline while the run waits for the others', async () => {
  let loaded = false;
  const { onFinish } = startRun({
    steps: { render: { check: () => false, failTime: 200 }, data: () => loaded },
  });

  await afterTicks(4);
  expect(onFinish).not.toHaveBeenCalled();
  loaded = true;
  await afterTicks(1);

  expect(onFinish).toHaveBeenCalledWith(
    expect.objectContaining({ duration: 500, steps: { render: false, data: true } }),
  );
});

test('fails pending steps when the run failTime elapses', async () => {
  const { onFinish } = startRun({
    failTime: 1000,
    steps: { render: () => true, data: () => false },
  });

  await jest.advanceTimersByTimeAsync(1000);

  expect(onFinish).toHaveBeenCalledTimes(1);
  expect(onFinish).toHaveBeenCalledWith(
    expect.objectContaining({ duration: 1000, steps: { render: true, data: false } }),
  );
});

test('excludes waiting for the start condition from the duration', async () => {
  let blockVisible = false;
  const { run, onFinish } = startRun({
    startWhen: () => blockVisible,
    steps: { render: () => true, data: () => true },
  });

  await afterTicks(3);
  expect(run.state).toBe('waiting');
  blockVisible = true;
  await afterTicks(1);

  expect(onFinish).toHaveBeenCalledWith(expect.objectContaining({ duration: 0 }));
});

test('dispose stops the run without reporting, even when a check resolves later', async () => {
  const data = deferred();
  const { run, onFinish } = startRun({ steps: { render: () => true, data: () => data.promise } });

  run.dispose();
  data.resolve(true);
  await afterTicks(1);

  expect(run.state).toBe('disposed');
  expect(onFinish).not.toHaveBeenCalled();
});

test('does not run an async check again while the previous one is pending', async () => {
  const data = deferred();
  const check = jest.fn(() => data.promise);
  const { onFinish } = startRun({ steps: { render: () => true, data: check } });

  await afterTicks(5);
  expect(check).toHaveBeenCalledTimes(1);
  data.resolve(true);
  await afterTicks(0);

  expect(onFinish).toHaveBeenCalledWith(
    expect.objectContaining({ steps: { render: true, data: true } }),
  );
});

test('retries a check that throws or rejects on the next tick', async () => {
  const outcomes: (() => boolean | Promise<boolean>)[] = [
    () => {
      throw new Error('not ready');
    },
    () => Promise.reject(new Error('not ready')),
    () => true,
  ];
  const { onFinish } = startRun({ steps: { render: () => outcomes.shift()!(), data: () => true } });

  await afterTicks(2);

  expect(onFinish).toHaveBeenCalledWith(
    expect.objectContaining({ duration: 200, steps: { render: true, data: true } }),
  );
});

test('excludes paused time from the duration and the deadlines', async () => {
  let rendered = false;
  const { run, onFinish } = startRun({
    failTime: 1000,
    steps: { render: { check: () => rendered, failTime: 300 }, data: () => true },
  });

  await afterTicks(1);
  run.pause();
  await jest.advanceTimersByTimeAsync(5000);
  run.resume();
  rendered = true;
  await afterTicks(1);

  expect(onFinish).toHaveBeenCalledWith(
    expect.objectContaining({ duration: 200, steps: { render: true, data: true } }),
  );
});

test('reports the run state through the whole lifecycle', async () => {
  let ready = false;
  let rendered = false;
  const { run } = startRun({
    startWhen: () => ready,
    steps: { render: () => rendered, data: () => true },
  });
  const states = [run.state];

  ready = true;
  await afterTicks(1);
  states.push(run.state);
  run.pause();
  states.push(run.state);
  run.resume();
  rendered = true;
  await afterTicks(1);
  states.push(run.state);

  expect(states).toEqual(['waiting', 'running', 'paused', 'done']);
});

test('ignores a late true from a check that missed its deadline', async () => {
  const data = deferred();
  let rendered = false;
  const { onFinish } = startRun({
    steps: { render: () => rendered, data: { check: () => data.promise, failTime: 200 } },
  });

  await afterTicks(2);
  data.resolve(true);
  rendered = true;
  await afterTicks(1);

  expect(onFinish).toHaveBeenCalledWith(
    expect.objectContaining({ steps: { render: true, data: false } }),
  );
});

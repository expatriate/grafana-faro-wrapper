import { createRealFaro } from '../testing/realFaro';
import { sendMeasurement } from '../measurement/sendMeasurement';
import { STEP_CHECK_INTERVAL_MS } from './SloRun';
import { SloConfig, trackSlo } from './trackSlo';

function trackThroughRealFaro<S extends string>(config: SloConfig<S>) {
  const { faro, measurements } = createRealFaro();
  const tracker = trackSlo((metric) => sendMeasurement(faro, metric), config);
  return { tracker, measurements };
}

beforeEach(() => {
  jest.useFakeTimers();
  document.body.innerHTML = '';
});

afterEach(() => {
  jest.useRealTimers();
});

test('a finished run sends exactly one histogram with the step results and extra labels', async () => {
  let cardsRendered = false;
  const { measurements } = trackThroughRealFaro({
    name: 'payments:display-groups',
    failTime: 1000,
    buckets: [100, 500, 1000],
    labels: () => ({ paymentGroupsAmount: 3 }),
    steps: { 'payment:show-tariffs': () => true, 'payment:show-cards': () => cardsRendered },
  });

  await jest.advanceTimersByTimeAsync(STEP_CHECK_INTERVAL_MS);
  cardsRendered = true;
  await jest.advanceTimersByTimeAsync(STEP_CHECK_INTERVAL_MS);
  await jest.advanceTimersByTimeAsync(2000);

  expect(measurements()).toHaveLength(1);
  expect(measurements()[0]).toMatchObject({
    type: 'custom',
    values: { 'payments:display-groups': 200 },
    context: {
      'measurement.unit': 'MILLISECONDS',
      'measurement.metric.type': 'histogram',
      'measurement.buckets': '100,500,1000',
      'measurement.result': 'success',
      'measurement.labels': {
        status: 'success',
        'payment:show-tariffs': true,
        'payment:show-cards': true,
        paymentGroupsAmount: 3,
      },
    },
  });
});

test('sends the metric when every step passes on the very first check', async () => {
  const { tracker, measurements } = trackThroughRealFaro({
    name: 'page_ready',
    failTime: 1000,
    steps: { render: () => true, data: () => true },
  });

  expect(tracker.state).toBe('done');
  expect(measurements()).toHaveLength(1);
  expect(measurements()[0].context).toMatchObject({
    'measurement.result': 'success',
    'measurement.labels': { status: 'success', render: true, data: true },
  });
});

test('a step that misses its deadline makes the run fail and shows which step failed', async () => {
  const { measurements } = trackThroughRealFaro({
    name: 'page_ready',
    failTime: 300,
    steps: { render: () => true, images: () => new Promise<boolean>(() => {}) },
  });

  await jest.advanceTimersByTimeAsync(300);

  expect(measurements()[0].context).toMatchObject({
    'measurement.result': 'fail',
    'measurement.labels': { status: 'fail', render: true, images: false },
  });
});

test('a disposed run sends nothing', async () => {
  const { tracker, measurements } = trackThroughRealFaro({
    name: 'page_ready',
    failTime: 300,
    steps: { render: () => true, images: () => false },
  });

  tracker.dispose();
  await jest.advanceTimersByTimeAsync(1000);

  expect(tracker.state).toBe('disposed');
  expect(measurements()).toHaveLength(0);
});

test('a selector in startWhen delays the clock until the element appears', async () => {
  const { tracker, measurements } = trackThroughRealFaro({
    name: 'resellers_ready',
    failTime: 1000,
    startWhen: '[data-slo="reseller-link"]',
    steps: { list: () => true },
  });

  await jest.advanceTimersByTimeAsync(3000);
  expect(tracker.state).toBe('waiting');
  expect(measurements()).toHaveLength(0);

  document.body.insertAdjacentHTML('beforeend', '<a data-slo="reseller-link"></a>');
  await jest.advanceTimersByTimeAsync(STEP_CHECK_INTERVAL_MS);

  expect(tracker.state).toBe('done');
  expect(measurements()[0]).toMatchObject({ values: { resellers_ready: 0 } });
});

test('disposing while waiting for the element sends nothing when it appears later', async () => {
  const { tracker, measurements } = trackThroughRealFaro({
    name: 'resellers_ready',
    failTime: 1000,
    startWhen: '[data-slo="reseller-link"]',
    steps: { list: () => true },
  });

  tracker.dispose();
  document.body.insertAdjacentHTML('beforeend', '<a data-slo="reseller-link"></a>');
  await jest.advanceTimersByTimeAsync(STEP_CHECK_INTERVAL_MS);

  expect(tracker.state).toBe('disposed');
  expect(measurements()).toHaveLength(0);
});

test('starts at once when the startWhen element is already on the page', () => {
  document.body.innerHTML = '<a data-slo="reseller-link"></a>';

  const { tracker, measurements } = trackThroughRealFaro({
    name: 'resellers_ready',
    failTime: 1000,
    startWhen: '[data-slo="reseller-link"]',
    steps: { list: () => true },
  });

  expect(tracker.state).toBe('done');
  expect(measurements()[0]).toMatchObject({ values: { resellers_ready: 0 } });
});

test('an invalid startWhen selector warns and keeps waiting instead of throwing', async () => {
  const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});

  const { tracker } = trackThroughRealFaro({
    name: 'resellers_ready',
    failTime: 1000,
    startWhen: '[data-slo=reseller link]',
    steps: { list: () => true },
  });
  await jest.advanceTimersByTimeAsync(STEP_CHECK_INTERVAL_MS);

  expect(tracker.state).toBe('waiting');
  expect(warn).toHaveBeenCalledWith(
    expect.stringContaining('[data-slo=reseller link]'),
    expect.anything(),
  );
  tracker.dispose();
  warn.mockRestore();
});

test('a startWhen predicate delays the clock and a throwing one means not yet', async () => {
  let calls = 0;
  const { tracker, measurements } = trackThroughRealFaro({
    name: 'page_ready',
    failTime: 1000,
    startWhen: () => {
      calls += 1;
      if (calls < 3) throw new Error('not mounted');
      return calls >= 5;
    },
    steps: { render: () => true },
  });

  await jest.advanceTimersByTimeAsync(3 * STEP_CHECK_INTERVAL_MS);
  expect(tracker.state).toBe('waiting');
  await jest.advanceTimersByTimeAsync(STEP_CHECK_INTERVAL_MS);

  expect(measurements()[0]).toMatchObject({ values: { page_ready: 0 } });
});

test('pauseWhenHidden: false keeps counting while the tab is hidden', async () => {
  let rendered = false;
  const { measurements } = trackThroughRealFaro({
    name: 'page_ready',
    failTime: 10_000,
    pauseWhenHidden: false,
    steps: { render: () => rendered },
  });

  Object.defineProperty(document, 'hidden', { configurable: true, value: true });
  document.dispatchEvent(new Event('visibilitychange'));
  await jest.advanceTimersByTimeAsync(10 * STEP_CHECK_INTERVAL_MS);
  rendered = true;
  await jest.advanceTimersByTimeAsync(STEP_CHECK_INTERVAL_MS);
  Object.defineProperty(document, 'hidden', { configurable: true, value: false });

  expect(measurements()[0]).toMatchObject({ values: { page_ready: 11 * STEP_CHECK_INTERVAL_MS } });
});

test('static labels can be passed as an object, like in sendMetric', () => {
  const { measurements } = trackThroughRealFaro({
    name: 'page_ready',
    failTime: 1000,
    labels: { payment: 'card' },
    steps: { render: () => true },
  });

  expect(measurements()[0].context['measurement.labels']).toEqual({
    status: 'success',
    render: true,
    payment: 'card',
  });
});

test('labels cannot override the status or a step result, and the clash is reported', () => {
  const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});

  const { measurements } = trackThroughRealFaro({
    name: 'page_ready',
    failTime: 300,
    labels: () => ({ status: 'success', render: 'ssr', source: 'landing' }),
    steps: { render: () => false },
  });
  jest.advanceTimersByTime(300);

  expect(measurements()[0].context['measurement.labels']).toEqual({
    status: 'fail',
    render: false,
    source: 'landing',
  });
  expect(warn).toHaveBeenCalledWith(expect.stringContaining('status, render'));
  warn.mockRestore();
});

test('a labels() function that throws sends the metric without extra labels', () => {
  const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});

  const { measurements } = trackThroughRealFaro({
    name: 'page_ready',
    failTime: 1000,
    labels: () => {
      throw new Error('store is not ready');
    },
    steps: { render: () => true },
  });

  expect(measurements()[0].context['measurement.labels']).toEqual({
    status: 'success',
    render: true,
  });
  expect(warn).toHaveBeenCalledTimes(1);
  warn.mockRestore();
});

test('an SLO without steps is not tracked and sends nothing', async () => {
  const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});

  const { tracker, measurements } = trackThroughRealFaro({
    name: 'page_ready',
    failTime: 1000,
    steps: {},
  });
  await jest.advanceTimersByTimeAsync(1000);

  expect(tracker.state).toBe('disposed');
  expect(measurements()).toHaveLength(0);
  expect(warn).toHaveBeenCalledWith(expect.stringContaining('page_ready'));
  warn.mockRestore();
});

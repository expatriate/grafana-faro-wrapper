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

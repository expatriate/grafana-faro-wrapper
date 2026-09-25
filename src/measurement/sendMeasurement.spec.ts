import { createRealFaro } from '../testing/realFaro';
import { sendMeasurement } from './sendMeasurement';
import { Metric } from './types';

function sendThroughRealFaro(...metrics: Metric[]): Record<string, any>[] {
  const { faro, measurements } = createRealFaro();
  metrics.forEach((metric) => sendMeasurement(faro, metric));
  return measurements();
}

const click: Metric = { name: 'user_action', value: 1, unit: 'EVENTS', type: 'counter' };

test('delivers value, unit, type, result and buckets as measurement context', () => {
  const [measurement] = sendThroughRealFaro({
    name: 'checkout',
    value: 1234,
    unit: 'MILLISECONDS',
    type: 'histogram',
    result: 'fail',
    buckets: [100, 500, 1000],
    description: 'checkout ready',
  });

  expect(measurement.type).toBe('custom');
  expect(measurement.values).toEqual({ checkout: 1234 });
  expect(measurement.context).toEqual({
    'measurement.unit': 'MILLISECONDS',
    'measurement.metric.type': 'histogram',
    'measurement.result': 'fail',
    'measurement.buckets': '100,500,1000',
    'measurement.description': 'checkout ready',
  });
});

test('delivers labels as an object with boolean and number values kept', () => {
  const [measurement] = sendThroughRealFaro({
    ...click,
    labels: { status: 'success', 'payment:show-tariff': true, paymentGroupsAmount: 3 },
  });

  expect(measurement.context['measurement.labels']).toEqual({
    status: 'success',
    'payment:show-tariff': true,
    paymentGroupsAmount: 3,
  });
});

test('does not send a description key when the metric has none', () => {
  const [measurement] = sendThroughRealFaro(click);

  expect(measurement.context).not.toHaveProperty('measurement.description');
});

test('delivers every identical metric instead of deduplicating repeats', () => {
  expect(sendThroughRealFaro(click, click)).toHaveLength(2);
});

test('stamps the measurement with the metric timestamp when one is given', () => {
  const [measurement] = sendThroughRealFaro({ ...click, timestamp: Date.UTC(2026, 0, 1) });

  expect(measurement.timestamp).toBe('2026-01-01T00:00:00.000Z');
});

test('sends 0 instead of a value that is not a number', () => {
  const [measurement] = sendThroughRealFaro({ ...click, value: Number.NaN });

  expect(measurement.values).toEqual({ user_action: 0 });
});

import { MEASUREMENT_KEYS } from './keys';
import { Metric } from './types';

export function constructMetricContext({
  description,
  unit,
  result,
  type,
  labels,
  buckets,
}: Omit<Metric, 'timestamp' | 'name' | 'value'>): Record<string, string> {
  return {
    [MEASUREMENT_KEYS.UNIT]: unit,
    [MEASUREMENT_KEYS.TYPE]: type,
    ...(description && { [MEASUREMENT_KEYS.DESCRIPTION]: description }),
    ...(labels && { [MEASUREMENT_KEYS.LABELS]: JSON.stringify(labels) }),
    ...(result && { [MEASUREMENT_KEYS.RESULT]: result }),
    ...(buckets && { [MEASUREMENT_KEYS.BUCKETS]: buckets.join(',') }),
  };
}

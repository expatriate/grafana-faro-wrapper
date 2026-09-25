import { MEASUREMENT_KEYS } from './keys.ts';
import { Metric } from './types.ts';

export function constructMetricContext({
  description,
  unit,
  result,
  type,
  labels,
  buckets,
}: Omit<Metric, 'timestamp' | 'name' | 'value'>): Record<string, any> {
  return {
    [MEASUREMENT_KEYS.UNIT]: unit,
    [MEASUREMENT_KEYS.TYPE]: type,
    ...(description && { [MEASUREMENT_KEYS.DESCRIPTION]: description }),
    ...(labels && { [MEASUREMENT_KEYS.LABELS]: labels }),
    ...(result && { [MEASUREMENT_KEYS.RESULT]: result }),
    ...(buckets && { [MEASUREMENT_KEYS.BUCKETS]: buckets.join(',') }),
  };
}

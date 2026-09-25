import { MEASUREMENT_KEYS } from '../../measurement/keys.ts';
import { CustomMetric } from '../types.ts';

export function constructMetricContext({
  description,
  unit,
  status,
  result,
  type,
  labels,
  buckets,
}: Omit<CustomMetric, 'timestamp' | 'name' | 'value'>): Record<string, any> {
  return {
    [MEASUREMENT_KEYS.DESCRIPTION]: description,
    [MEASUREMENT_KEYS.UNIT]: unit,
    [MEASUREMENT_KEYS.TYPE]: type,
    ...(labels && { [MEASUREMENT_KEYS.LABELS]: labels }),
    ...(status && { [MEASUREMENT_KEYS.STATUS]: status }),
    ...(result && { [MEASUREMENT_KEYS.RESULT]: result }),
    ...(buckets && { [MEASUREMENT_KEYS.BUCKETS]: buckets.join(',') }),
  };
}

import { Faro } from '@grafana/faro-web-sdk';
import { LOG_PREFIX } from '../utils/logPrefix';
import { constructMetricContext } from './constructMetricContext';
import { CUSTOM_MEASUREMENT_TYPE } from './keys';
import { Metric, METRIC_TYPES, METRIC_UNITS } from './types';

const reportedMetrics = new Set<string>();

function warnAboutInvalidFields({ name, unit, type }: Metric) {
  const invalid = [
    typeof name !== 'string' || name === '' ? 'name' : null,
    METRIC_UNITS.includes(unit) ? null : 'unit',
    METRIC_TYPES.includes(type) ? null : 'type',
  ].filter(Boolean);
  const key = `${name}|${unit}|${type}`;
  if (invalid.length === 0 || reportedMetrics.has(key)) {
    return;
  }
  reportedMetrics.add(key);
  console.warn(
    `${LOG_PREFIX} Metric "${name}" has invalid ${invalid.join(', ')}, sending it anyway`,
  );
}

export function sendMeasurement(faro: Faro, metric: Metric) {
  const { name, value, timestamp, ...rest } = metric;
  warnAboutInvalidFields(metric);
  const numeric = Number(value);
  faro.api.pushMeasurement(
    {
      type: CUSTOM_MEASUREMENT_TYPE,
      values: { [name]: Number.isFinite(numeric) ? numeric : 0 },
    },
    { context: constructMetricContext(rest), skipDedupe: true, timestampOverwriteMs: timestamp },
  );
}

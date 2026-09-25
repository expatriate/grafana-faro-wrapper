import { Faro } from '@grafana/faro-web-sdk';
import { constructMetricContext } from './constructMetricContext.ts';
import { CUSTOM_MEASUREMENT_TYPE } from './keys.ts';
import { toMetricValue } from './toMetricValue.ts';
import { Metric } from './types.ts';

export function sendMeasurement(faro: Faro, { name, value, timestamp, ...rest }: Metric) {
  faro.api.pushMeasurement(
    { type: CUSTOM_MEASUREMENT_TYPE, values: { [name]: toMetricValue(value) } },
    { context: constructMetricContext(rest), skipDedupe: true, timestampOverwriteMs: timestamp },
  );
}

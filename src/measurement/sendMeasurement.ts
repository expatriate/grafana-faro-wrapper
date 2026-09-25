import { Faro } from '@grafana/faro-web-sdk';
import { constructMetricContext } from './constructMetricContext';
import { CUSTOM_MEASUREMENT_TYPE } from './keys';
import { Metric } from './types';

export function sendMeasurement(faro: Faro, { name, value, timestamp, ...rest }: Metric) {
  const numeric = Number.isNaN(Number(value)) ? 0 : Number(value);
  faro.api.pushMeasurement(
    {
      type: CUSTOM_MEASUREMENT_TYPE,
      values: { [name]: numeric },
    },
    { context: constructMetricContext(rest), skipDedupe: true, timestampOverwriteMs: timestamp },
  );
}

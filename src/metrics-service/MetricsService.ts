import { FaroService } from '../faro-service/FaroService.ts';
import { CUSTOM_MEASUREMENT_TYPE } from '../measurement/keys.ts';
import { LOG_PREFIX } from '../utils/logPrefix.ts';
import { constructMetricContext } from './helpers/constructMetricContext.ts';
import { toMetricValue } from './helpers/toMetricValue.ts';
import { CustomMetric } from './types.ts';

export class MetricsService {
  constructor(private faroService: FaroService) {}

  sendCustomMetric({ name, value, timestamp, ...rest }: CustomMetric) {
    try {
      const faroInstance = this.faroService.getInstance();

      faroInstance.api.pushMeasurement(
        {
          type: CUSTOM_MEASUREMENT_TYPE,
          values: { [name]: toMetricValue(value) },
        },
        {
          context: constructMetricContext(rest),
          skipDedupe: true,
          timestampOverwriteMs: timestamp,
        },
      );
    } catch (e) {
      console.warn(
        `${LOG_PREFIX} Failed to send metric:`,
        e instanceof Error ? e.message : 'Unknown error',
      );
    }
  }
}

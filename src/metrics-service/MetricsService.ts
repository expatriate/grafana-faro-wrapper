import { FaroService } from '../faro-service/FaroService.ts';
import { safeNumberConversion } from '../utils/helpers.ts';
import { constructMetricContext } from './helpers/constructMetricContext.ts';
import { CustomMetricBase } from './types.ts';

export class MetricsService {
  constructor(private faroService: FaroService) {}

  sendCustomMetric({ name, value, ...rest }: CustomMetricBase) {
    try {
      const faroInstance = this.faroService.getInstance();

      faroInstance.api.pushMeasurement(
        {
          type: 'custom',
          values: { [name]: safeNumberConversion(value) },
        },
        { context: constructMetricContext(rest), skipDedupe: true },
      );
    } catch (e) {
      console.warn(
        '[Faro-react-wrapper] Failed to send metric:',
        e instanceof Error ? e.message : 'Unknown error',
      );
    }
  }
}

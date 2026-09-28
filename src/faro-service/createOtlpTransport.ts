import { OtlpHttpTransport } from '@grafana/faro-transport-otlp-http';
import { TransportItem } from '@grafana/faro-web-sdk';
import { OTLP_LOG_BODIES } from '../measurement/otlpLogBodies';
import { parseMetricLabels } from '../measurement/parseMetricLabels';

export function createOtlpTransport(faroUrl: string, faroKey: string): OtlpHttpTransport {
  // Declared on call: dist/index.umd.js must load even before the Faro IIFE bundles define the base class
  class LabelledOtlpTransport extends OtlpHttpTransport {
    send(items: TransportItem[]) {
      return super.send(items.map(parseMetricLabels));
    }
  }
  return new LabelledOtlpTransport({
    apiKey: faroKey,
    logsURL: faroUrl,
    otlpTransform: OTLP_LOG_BODIES,
  });
}

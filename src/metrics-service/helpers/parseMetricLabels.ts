import { MeasurementEvent, TransportItem, TransportItemType } from '@grafana/faro-web-sdk';
import { MEASUREMENT_KEYS } from '../types.ts';

export function parseMetricLabels(beacon: TransportItem): TransportItem {
  if (beacon.type !== TransportItemType.MEASUREMENT) return beacon;
  const measurement = beacon.payload as MeasurementEvent | undefined;
  const labels = measurement?.context?.[MEASUREMENT_KEYS.LABELS];
  if (measurement?.type !== 'custom' || !labels) return beacon;

  try {
    return {
      ...beacon,
      payload: {
        ...measurement,
        context: { ...measurement.context, [MEASUREMENT_KEYS.LABELS]: JSON.parse(labels) },
      },
    };
  } catch {
    return beacon;
  }
}

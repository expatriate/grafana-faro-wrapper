import { MEASUREMENT_KEYS } from '../types.ts';

export function parseMetricLabels(beacon: Record<string, any>): Record<string, any> {
  const labels = beacon.payload?.context?.[MEASUREMENT_KEYS.LABELS];
  if (beacon.type !== 'measurement' || beacon.payload?.type !== 'custom' || !labels) return beacon;

  try {
    return {
      ...beacon,
      payload: {
        ...beacon.payload,
        context: {
          ...beacon.payload.context,
          [MEASUREMENT_KEYS.LABELS]: JSON.parse(labels),
        },
      },
    };
  } catch {
    return beacon;
  }
}

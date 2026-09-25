import { OtlpHttpTransport } from '@grafana/faro-transport-otlp-http';
import { toLogfmt } from '../utils/logfmt.ts';
import { MEASUREMENT_KEYS } from './keys.ts';

type OtlpTransform = NonNullable<
  ConstructorParameters<typeof OtlpHttpTransport>[0]['otlpTransform']
>;

function measurementValueFields(values: Record<string, number>) {
  const [first, ...extra] = Object.entries(values);
  return {
    name: first?.[0],
    value: first?.[1],
    ...Object.fromEntries(extra.map(([key, value]) => [`value_${key}`, value])),
  };
}

export const OTLP_LOG_BODIES: OtlpTransform = {
  createMeasurementLogBody({ payload }) {
    return toLogfmt({
      faro_signal: 'measurement',
      type: payload.type,
      ...measurementValueFields(payload.values),
      result: payload.context?.[MEASUREMENT_KEYS.RESULT],
    });
  },
  createErrorLogBody({ payload }) {
    return toLogfmt({ faro_signal: 'error', type: payload.type, message: payload.value });
  },
};

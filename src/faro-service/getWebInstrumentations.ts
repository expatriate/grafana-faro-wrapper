import {
  getWebInstrumentations as getFaroWebInstrumentations,
  Instrumentation,
  WebVitalsInstrumentation,
} from '@grafana/faro-web-sdk';

type WebInstrumentationsOptions = Parameters<typeof getFaroWebInstrumentations>[0];

function canRunWebVitals(): boolean {
  const arrays = Array.prototype as Partial<Record<'at' | 'findLast', unknown>>;
  return typeof arrays.at === 'function' && typeof arrays.findLast === 'function';
}

export function getWebInstrumentations(options?: WebInstrumentationsOptions): Instrumentation[] {
  const instrumentations = getFaroWebInstrumentations(options);
  return canRunWebVitals()
    ? instrumentations
    : instrumentations.filter((item) => !(item instanceof WebVitalsInstrumentation));
}

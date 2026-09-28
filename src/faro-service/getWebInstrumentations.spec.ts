import { WebVitalsInstrumentation } from '@grafana/faro-web-sdk';
import { getWebInstrumentations } from './getWebInstrumentations';

const hasWebVitals = () =>
  getWebInstrumentations().some((item) => item instanceof WebVitalsInstrumentation);

describe('getWebInstrumentations', () => {
  it('keeps Web Vitals where the browser runs them', () => {
    expect(hasWebVitals()).toBe(true);
  });

  it.each(['at', 'findLast'] as const)(
    'leaves Web Vitals out without Array.prototype.%s, which they call',
    (method) => {
      const original = Object.getOwnPropertyDescriptor(Array.prototype, method)!;
      delete (Array.prototype as unknown as Record<string, unknown>)[method];
      try {
        expect(hasWebVitals()).toBe(false);
        expect(getWebInstrumentations().length).toBeGreaterThan(0);
      } finally {
        Object.defineProperty(Array.prototype, method, original);
      }
    },
  );
});

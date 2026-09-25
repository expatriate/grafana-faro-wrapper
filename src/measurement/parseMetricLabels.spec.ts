import { parseMetricLabels } from './parseMetricLabels.ts';

describe('parseMetricLabels', () => {
  test('restores labels that Faro stringified in a custom measurement context', () => {
    const beacon: any = {
      type: 'measurement',
      payload: {
        type: 'custom',
        context: { 'measurement.labels': '{"step":"payment","geo":{"country":"de"}}' },
      },
    };

    expect((parseMetricLabels(beacon).payload as any).context['measurement.labels']).toEqual({
      step: 'payment',
      geo: { country: 'de' },
    });
  });

  test('passes through a measurement without payload and unparsable labels', () => {
    const withoutPayload: any = { type: 'measurement' };
    const brokenLabels: any = {
      type: 'measurement',
      payload: { type: 'custom', context: { 'measurement.labels': 'not json' } },
    };

    expect(parseMetricLabels(withoutPayload)).toBe(withoutPayload);
    expect(parseMetricLabels(brokenLabels)).toBe(brokenLabels);
  });
});

import { Metric, MetricLabels, MetricResult } from '../measurement/types.ts';
import { LOG_PREFIX } from '../utils/logPrefix.ts';
import { SloRun } from './SloRun.ts';
import { SloRunState, StepConfig } from './types.ts';
import { pauseWhileHidden } from './visibility.ts';

export interface SloConfig<S extends string> {
  name: string;
  failTime: number;
  steps: Record<S, StepConfig>;
  buckets?: number[];
  labels?: () => MetricLabels;
  startWhen?: () => boolean;
  pauseWhenHidden?: boolean;
  log?: boolean;
}

export interface SloTracker {
  readonly state: SloRunState;
  dispose(): void;
}

function extraLabels(labels: (() => MetricLabels) | undefined): MetricLabels {
  try {
    return labels?.() ?? {};
  } catch (error) {
    console.warn(`${LOG_PREFIX} SLO labels() threw, sending the metric without them:`, error);
    return {};
  }
}

export function trackSlo<S extends string>(
  send: (metric: Metric) => void,
  { name, buckets, labels, pauseWhenHidden = true, ...runConfig }: SloConfig<S>,
): SloTracker {
  const run = new SloRun<S>({
    ...runConfig,
    onFinish: ({ timestamp, duration, steps }) => {
      unsubscribe();
      const result: MetricResult = Object.values(steps).every(Boolean) ? 'success' : 'fail';
      send({
        name,
        value: duration,
        timestamp,
        unit: 'MILLISECONDS',
        type: 'histogram',
        buckets,
        result,
        labels: { status: result, ...steps, ...extraLabels(labels) },
      });
    },
  });
  const unsubscribe = pauseWhenHidden ? pauseWhileHidden(run) : () => {};
  run.start();

  return {
    get state() {
      return run.state;
    },
    dispose() {
      unsubscribe();
      run.dispose();
    },
  };
}

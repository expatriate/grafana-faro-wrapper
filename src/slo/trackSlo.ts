import { Metric, MetricLabels, MetricResult } from '../measurement/types';
import { LOG_PREFIX } from '../utils/logPrefix';
import { SloRun } from './SloRun';
import { SloRunOptions, SloRunState } from './types';
import { pauseWhileHidden } from './visibility';

export interface SloConfig<S extends string> extends SloRunOptions<S> {
  name: string;
  buckets?: number[];
  labels?: () => MetricLabels;
  pauseWhenHidden?: boolean;
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
  let unsubscribe = () => {};
  const run = new SloRun<S>({
    ...runConfig,
    onFinish: ({ timestamp, duration, passed, steps }) => {
      unsubscribe();
      const result: MetricResult = passed ? 'success' : 'fail';
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
  if (pauseWhenHidden && run.state !== 'done') {
    unsubscribe = pauseWhileHidden(run);
  }

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

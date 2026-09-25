import { Metric, MetricLabels, MetricResult } from '../measurement/types';
import { LOG_PREFIX } from '../utils/logPrefix';
import { SloRun } from './SloRun';
import { SloRunOptions, SloRunState } from './types';
import { pauseWhileHidden } from './visibility';
import { waitForElement } from './waitForElement';

export interface SloConfig<S extends string> extends Omit<SloRunOptions<S>, 'startWhen'> {
  name: string;
  startWhen?: string | (() => boolean);
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
  { name, buckets, labels, pauseWhenHidden = true, startWhen, ...runConfig }: SloConfig<S>,
): SloTracker {
  let run: SloRun<S> | undefined;
  let disposed = false;
  let unsubscribe = () => {};

  const start = (startCondition?: () => boolean) => {
    if (disposed) {
      return;
    }
    run = new SloRun<S>({
      ...runConfig,
      startWhen: startCondition,
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
  };

  const stopWaiting =
    typeof startWhen === 'string'
      ? waitForElement(startWhen, () => start())
      : (start(startWhen), () => {});

  return {
    get state() {
      if (run) {
        return run.state;
      }
      return disposed ? 'disposed' : 'waiting';
    },
    dispose() {
      disposed = true;
      stopWaiting();
      unsubscribe();
      run?.dispose();
    },
  };
}

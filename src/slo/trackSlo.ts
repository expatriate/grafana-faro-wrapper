import { Metric, MetricLabels, MetricResult } from '../measurement/types';
import { LOG_PREFIX } from '../utils/logPrefix';
import { SloRun } from './SloRun';
import { SloRunOptions, SloRunState, StepConfig, StepResults } from './types';
import { pauseWhenHidden } from './visibility';
import { waitForElement } from './waitForElement';

const STATUS_LABEL = 'status';

export interface SloConfig<S extends string> extends Omit<SloRunOptions<S>, 'startWhen' | 'steps'> {
  name: string;
  steps: Record<S, StepConfig> & { [STATUS_LABEL]?: never };
  startWhen?: string | (() => boolean);
  buckets?: number[];
  labels?: MetricLabels | (() => MetricLabels);
  pauseWhenHidden?: boolean;
}

export interface SloTracker {
  readonly state: SloRunState;
  dispose(): void;
}

export const inactiveTracker: SloTracker = { state: 'disposed', dispose() {} };

function extraLabels(labels: SloConfig<string>['labels']): MetricLabels {
  if (typeof labels !== 'function') {
    return labels ?? {};
  }
  try {
    return labels();
  } catch (error) {
    console.warn(`${LOG_PREFIX} SLO labels() threw, sending the metric without them:`, error);
    return {};
  }
}

function sloLabels(
  name: string,
  result: MetricResult,
  steps: StepResults<string>,
  labels: SloConfig<string>['labels'],
): MetricLabels {
  const extra = extraLabels(labels);
  const reserved = [STATUS_LABEL, ...Object.keys(steps)];
  const clashing = reserved.filter((key) => key in extra);
  if (STATUS_LABEL in steps) {
    clashing.push(`step "${STATUS_LABEL}"`);
  }
  if (clashing.length > 0) {
    console.warn(
      `${LOG_PREFIX} SLO "${name}": ${clashing.join(', ')} clash with step results or status and are overridden`,
    );
  }
  return { ...extra, ...steps, [STATUS_LABEL]: result };
}

export function trackSlo<S extends string>(
  send: (metric: Metric) => void,
  {
    name,
    buckets,
    labels,
    pauseWhenHidden: pausesWhenHidden = true,
    startWhen,
    ...runConfig
  }: SloConfig<S>,
): SloTracker {
  if (Object.keys(runConfig.steps).length === 0) {
    console.warn(`${LOG_PREFIX} SLO "${name}" has no steps and is not tracked`);
    return inactiveTracker;
  }

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
          labels: sloLabels(name, result, steps, labels),
        });
      },
    });
    if (pausesWhenHidden && run.state !== 'done') {
      unsubscribe = pauseWhenHidden(run);
    }
  };

  let stopWaiting = () => {};
  if (typeof startWhen === 'string') {
    stopWaiting = waitForElement(startWhen, () => start());
  } else {
    start(startWhen);
  }

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

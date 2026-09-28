import { Metric, MetricLabels, MetricResult } from '../measurement/types';
import { LOG_PREFIX } from '../utils/logPrefix';
import { queryOne } from '../utils/safeQuery';
import { SloRun } from './SloRun';
import { SloRunOptions, SloRunState, StepConfig, StepResults } from './types';
import { pauseWhenHidden } from './visibility';

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

const hasOwn = (object: object, key: string) => Object.prototype.hasOwnProperty.call(object, key);

function asLabels(value: unknown): MetricLabels {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as MetricLabels)
    : {};
}

function extraLabels(labels: SloConfig<string>['labels']): MetricLabels {
  if (typeof labels !== 'function') {
    return asLabels(labels);
  }
  try {
    return asLabels(labels());
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
  const clashing = reserved.filter((key) => hasOwn(extra, key));
  if (hasOwn(steps, STATUS_LABEL)) {
    clashing.push(`step "${STATUS_LABEL}"`);
  }
  if (clashing.length > 0) {
    console.warn(
      `${LOG_PREFIX} SLO "${name}": ${clashing.join(', ')} clash with step results or status and are overridden`,
    );
  }
  return { ...extra, ...steps, [STATUS_LABEL]: result };
}

function startCondition(startWhen: SloConfig<string>['startWhen']): (() => boolean) | undefined {
  return typeof startWhen === 'string' ? () => queryOne(startWhen) !== null : startWhen;
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

  let unsubscribe = () => {};
  const run = new SloRun<S>({
    ...runConfig,
    name,
    startWhen: startCondition(startWhen),
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

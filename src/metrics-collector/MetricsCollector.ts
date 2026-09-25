import { LOG_PREFIX } from '../utils/logPrefix.ts';
import { MetricFn, ReadyToCheckConditionFn } from './types.ts';

const STEP_CHECK_INTERVAL_MS = 100;

type RunState = 'idle' | 'running' | 'paused' | 'finishing' | 'done';

type Outcome = 'success' | 'fail';

export interface MetricsCollectorConfig<T extends string = string> {
  failTime?: number;
  steps: T[];
  log?: boolean;
  onSuccess: (params: MetricsCollectorCallback<T>) => void;
  onFail: (params: MetricsCollectorCallback<T>) => void;
}

export interface MetricsCollectorCallback<T extends string = string> {
  timestamp: number;
  duration: number;
  steps: Record<T, boolean>;
}

export class MetricsCollector<T extends string = string> {
  private stepChecks = new Map<T, { fn: MetricFn; conditionFn?: ReadyToCheckConditionFn }>();

  private stepResults = new Map<T, boolean>();

  private checksInProgress = new Set<T>();

  private cycle = 0;

  private state: RunState = 'idle';

  private readonly failTime?: number;

  private readonly steps: T[];

  private readonly log: boolean;

  private readonly onFail: (params: MetricsCollectorCallback<T>) => void;

  private readonly onSuccess: (params: MetricsCollectorCallback<T>) => void;

  private failTimer?: ReturnType<typeof setTimeout>;

  private checkInterval?: ReturnType<typeof setInterval>;

  private pauseStartTime?: number;

  private pausedDuration = 0;

  private startTime?: number;

  private finishTime?: number;

  constructor({ failTime, steps, onFail, onSuccess, log = false }: MetricsCollectorConfig<T>) {
    this.failTime = failTime;
    this.steps = steps;
    this.onFail = onFail;
    this.onSuccess = onSuccess;
    this.log = log;
  }

  start() {
    if (this.state !== 'idle') {
      return;
    }

    this.state = 'running';
    this.debug('start');

    this.startTime = performance.now();
    this.scheduleTimers();
  }

  pause() {
    if (this.state !== 'running') {
      return;
    }

    this.state = 'paused';
    this.pauseStartTime = performance.now();
    this.clearTimers();

    this.debug('pause');
  }

  resume() {
    if (this.state !== 'paused') {
      return;
    }

    this.state = 'running';
    this.pausedDuration += performance.now() - this.pauseStartTime!;
    this.pauseStartTime = undefined;

    this.debug('resume');

    this.finishIfAllStepsChecked();
    this.checkSteps();
    this.scheduleTimers();
  }

  getStatus() {
    const runningTime = this.activeElapsed();
    return {
      isRunning: this.state === 'running' || this.state === 'paused' || this.state === 'finishing',
      isDone: this.isFinished(),
      isPaused: this.state === 'paused',
      runningTime,
      pausedDuration: this.pausedDuration,
      registeredMetrics: Array.from(this.stepChecks.keys()),
      completedMetrics: Array.from(this.stepResults.entries()),
      pendingMetrics: this.steps.filter((step) => !this.stepResults.has(step)),
      remainingTime:
        this.failTime && this.startTime !== undefined
          ? Math.max(0, this.failTime - runningTime)
          : undefined,
    };
  }

  addMetricStep(key: T, fn: MetricFn, conditionFn?: ReadyToCheckConditionFn): this {
    if (this.isFinished() || !this.steps.includes(key) || this.stepChecks.has(key)) {
      return this;
    }

    this.start();
    this.stepChecks.set(key, { fn, conditionFn });

    this.debug('addMetricStep', key);
    this.checkSteps();

    return this;
  }

  reset() {
    this.clearTimers();

    this.cycle++;
    this.state = 'idle';
    this.stepChecks.clear();
    this.stepResults.clear();
    this.checksInProgress.clear();
    this.startTime = undefined;
    this.finishTime = undefined;
    this.pausedDuration = 0;
    this.pauseStartTime = undefined;

    this.debug('reset');
  }

  private isFinished() {
    return this.state === 'finishing' || this.state === 'done';
  }

  private activeElapsed() {
    if (this.startTime === undefined) {
      return 0;
    }
    const end = this.finishTime ?? this.pauseStartTime ?? performance.now();
    return end - this.startTime - this.pausedDuration;
  }

  private scheduleTimers() {
    this.checkInterval = setInterval(() => this.checkSteps(), STEP_CHECK_INTERVAL_MS);

    if (!this.failTime) {
      return;
    }

    const remaining = this.failTime - this.activeElapsed();
    if (remaining > 0) {
      this.failTimer = setTimeout(() => this.finish('fail'), remaining);
    } else {
      this.finish('fail');
    }
  }

  private clearTimers() {
    clearTimeout(this.failTimer);
    clearInterval(this.checkInterval);
    this.failTimer = undefined;
    this.checkInterval = undefined;
  }

  private async checkSteps() {
    if (this.state === 'paused') {
      return;
    }

    const cycle = this.cycle;
    const pendingChecks = Array.from(this.stepChecks.entries())
      .filter(([key]) => !this.stepResults.has(key) && !this.checksInProgress.has(key))
      .map(async ([key, { fn, conditionFn }]) => {
        const check = this.checkIfReady(key, fn, conditionFn);
        if (!check) {
          return;
        }
        this.checksInProgress.add(key);
        const passed = await this.runCheck(key, check);
        if (cycle !== this.cycle) {
          return;
        }
        this.checksInProgress.delete(key);
        this.stepResults.set(key, passed);
      });

    if (pendingChecks.length === 0) {
      return;
    }

    await Promise.all(pendingChecks);

    this.debug('checkSteps:results', this.stepResults);
    this.finishIfAllStepsChecked();
  }

  private checkIfReady(
    key: T,
    fn: MetricFn,
    conditionFn?: ReadyToCheckConditionFn,
  ): MetricFn | undefined {
    try {
      return !conditionFn || conditionFn() ? fn : undefined;
    } catch {
      this.debug('checkSteps:conditionError', key);
      return () => false;
    }
  }

  private async runCheck(key: T, fn: MetricFn): Promise<boolean> {
    try {
      const value = await fn();
      this.debug('checkSteps:result', key, value);
      return value;
    } catch {
      this.debug('checkSteps:error', key, false);
      return false;
    }
  }

  private finishIfAllStepsChecked() {
    if (this.state !== 'running') {
      return;
    }

    if (this.steps.every((step) => this.stepResults.has(step))) {
      const allPassed = this.steps.every((step) => this.stepResults.get(step) === true);
      this.finish(allPassed ? 'success' : 'fail');
    }
  }

  private finish(outcome: Outcome) {
    if (this.isFinished()) {
      return;
    }

    this.state = 'finishing';
    const cycle = this.cycle;

    queueMicrotask(() => {
      if (cycle !== this.cycle) {
        return;
      }
      this.state = 'done';
      this.finishTime = performance.now();
      this.clearTimers();

      const result: MetricsCollectorCallback<T> = {
        timestamp: Date.now(),
        duration: Math.round(this.activeElapsed()),
        steps: Object.fromEntries(
          this.steps.map((step) => [step, this.stepResults.get(step) || false]),
        ) as Record<T, boolean>,
      };

      this.debug('finish', outcome, new Date().toLocaleTimeString(), result.duration);

      if (outcome === 'success') {
        this.onSuccess(result);
      } else {
        this.onFail(result);
      }
    });
  }

  private debug(event: string, ...details: unknown[]) {
    if (this.log) {
      console.info(LOG_PREFIX, `slo:${event}`, ...details);
    }
  }
}

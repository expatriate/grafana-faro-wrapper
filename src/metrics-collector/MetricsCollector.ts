import { MetricFn, ReadyToCheckConditionFn } from './types.ts';

const DEFAULT_METRIC_STEP_CHECK_INTERVAL = 100;

export interface MetricsCollectorConfig<T extends string = string> {
  failTime?: number;
  steps: T[];
  log?: boolean;
  onSuccess: (params: MetricsCollectorCallback) => void;
  onFail: (params: MetricsCollectorCallback) => void;
}

export interface MetricsCollectorCallback {
  timestamp: number;
  duration: number;
  steps: { [k: string]: boolean };
}

export class MetricsCollector<T extends string = string> {
  private metrics = new Map<T, { fn: MetricFn; conditionFn?: ReadyToCheckConditionFn }>();

  private metricsResults = new Map<T, boolean>();

  private checksInProgress = new Set<T>();

  private cycle = 0;

  private readonly failTime?: number;

  private readonly steps: T[];

  private readonly log: boolean;

  private readonly onFail: (params: MetricsCollectorCallback) => void;

  private readonly onSuccess: (params: MetricsCollectorCallback) => void;

  private metricTimeRunner?: ReturnType<typeof setTimeout>;

  private metricStepsCheckInterval?: ReturnType<typeof setInterval>;

  private pauseStartTime?: number;

  private pausedDuration = 0;

  private startTime?: number;

  private isRunning = false;

  private isDone = false;

  private isPaused = false;

  constructor({ failTime, steps, onFail, onSuccess, log = false }: MetricsCollectorConfig<T>) {
    this.failTime = failTime;
    this.steps = steps;
    this.onFail = onFail;
    this.onSuccess = onSuccess;
    this.log = log;
  }

  start() {
    if (this.isRunning || this.isDone) {
      return;
    }

    this.isRunning = true;
    this.isPaused = false;
    this.pausedDuration = 0;
    this.pauseStartTime = undefined;

    this.debug('start');

    this.startTime = performance.now();
    this.checkSteps();
    this.scheduleTimers();
  }

  pause() {
    if (!this.isRunning || this.isPaused || this.isDone) {
      return;
    }

    this.isPaused = true;
    this.pauseStartTime = performance.now();
    this.clearTimers();

    this.debug('pause');
  }

  resume() {
    if (!this.isRunning || !this.isPaused || this.isDone) {
      return;
    }

    this.isPaused = false;

    if (this.pauseStartTime) {
      this.pausedDuration += performance.now() - this.pauseStartTime;
      this.pauseStartTime = undefined;
    }

    this.debug('resume');

    this.checkMetricsResults();
    this.checkSteps();
    this.scheduleTimers();
  }

  getStatus() {
    const runningTime = this.activeElapsed();
    return {
      isRunning: this.isRunning,
      isDone: this.isDone,
      isPaused: this.isPaused,
      runningTime,
      pausedDuration: this.pausedDuration,
      registeredMetrics: Array.from(this.metrics.keys()),
      completedMetrics: Array.from(this.metricsResults.entries()),
      pendingMetrics: this.steps.filter((step) => !this.metricsResults.has(step)),
      remainingTime:
        this.failTime && this.startTime !== undefined
          ? Math.max(0, this.failTime - runningTime)
          : undefined,
    };
  }

  addMetricStep(key: T, fn: MetricFn, conditionFn?: ReadyToCheckConditionFn): this {
    if (this.isDone || !this.steps.includes(key) || this.metrics.has(key)) {
      return this;
    }

    this.start();
    this.metrics.set(key, { fn, conditionFn });

    this.debug('addMetricStep', key);

    return this;
  }

  reset() {
    this.clearTimers();

    this.cycle++;
    this.metrics.clear();
    this.metricsResults.clear();
    this.checksInProgress.clear();
    this.isDone = false;
    this.isRunning = false;
    this.isPaused = false;
    this.startTime = undefined;
    this.pausedDuration = 0;
    this.pauseStartTime = undefined;

    this.debug('reset');
  }

  private activeElapsed() {
    if (this.startTime === undefined) {
      return 0;
    }
    return performance.now() - this.startTime - this.pausedDuration;
  }

  private scheduleTimers() {
    this.metricStepsCheckInterval = setInterval(
      () => this.checkSteps(),
      DEFAULT_METRIC_STEP_CHECK_INTERVAL,
    );

    if (!this.failTime) {
      return;
    }

    const remaining = this.failTime - this.activeElapsed();
    if (remaining > 0) {
      this.metricTimeRunner = setTimeout(() => this.finish(false), remaining);
    } else {
      this.finish(false);
    }
  }

  private clearTimers() {
    clearTimeout(this.metricTimeRunner);
    clearInterval(this.metricStepsCheckInterval);
    this.metricTimeRunner = undefined;
    this.metricStepsCheckInterval = undefined;
  }

  private async checkSteps() {
    if (this.isPaused) {
      return;
    }

    const cycle = this.cycle;
    const pendingChecks = Array.from(this.metrics.entries())
      .filter(([key]) => !this.metricsResults.has(key) && !this.checksInProgress.has(key))
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
        this.metricsResults.set(key, passed);
      });

    if (pendingChecks.length === 0) {
      return;
    }

    await Promise.all(pendingChecks);

    this.debug('checkSteps:results', this.metricsResults);
    this.checkMetricsResults();
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

  private checkMetricsResults() {
    if (this.isDone || this.isPaused) {
      return;
    }

    if (this.steps.every((step) => this.metricsResults.has(step))) {
      this.finish(this.steps.every((step) => this.metricsResults.get(step) === true));
    }
  }

  private finish(success: boolean) {
    if (this.isDone) {
      return;
    }

    this.isDone = true;

    queueMicrotask(() => {
      this.isRunning = false;
      this.clearTimers();

      const result: MetricsCollectorCallback = {
        timestamp: Date.now(),
        duration: Math.round(this.activeElapsed()),
        steps: Object.fromEntries(
          this.steps.map((step) => [step, this.metricsResults.get(step) || false]),
        ),
      };

      this.debug(
        'finish',
        success ? 'Success' : 'Fail',
        new Date().toLocaleTimeString(),
        result.duration,
      );

      if (success) {
        this.onSuccess(result);
      } else {
        this.onFail(result);
      }
    });
  }

  private debug(event: string, ...details: unknown[]) {
    if (this.log) {
      console.info(`[SLO-metrics:${event}]`, ...details);
    }
  }
}

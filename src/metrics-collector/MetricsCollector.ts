import { MetricFn, ReadyToCheckConditionFn } from './types.ts';

const DEFAULT_METRIC_STEP_CHECK_INTERVAL = 100;

interface MetricsCollectorConfig<T extends string = string> {
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

  private isCleaning = false;

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
    this.isDone = false;
    this.isPaused = false;
    this.pausedDuration = 0;
    this.pauseStartTime = undefined;

    if (this.log) {
      console.info('[SLO-metrics:start]');
    }

    this.startTime = performance.now();
    this.checkSteps();

    if (!this.metricStepsCheckInterval) {
      this.metricStepsCheckInterval = setInterval(() => {
        this.checkSteps();
      }, DEFAULT_METRIC_STEP_CHECK_INTERVAL);
    }

    if (this.failTime) {
      this.metricTimeRunner = setTimeout(() => {
        this.finish(false);
      }, this.failTime);
    }
  }

  pause() {
    if (!this.startTime || !this.isRunning || this.isPaused || this.isDone) {
      return;
    }

    this.isPaused = true;
    this.pauseStartTime = performance.now();

    this.cleanupTimeout();
    this.cleanupCheckInterval();

    if (this.log) {
      console.info('[SLO-metrics:pause]');
    }
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

    if (this.log) {
      console.info('[SLO-metrics:resume]');
    }

    this.checkSteps();

    if (!this.metricStepsCheckInterval) {
      this.metricStepsCheckInterval = setInterval(
        () => this.checkSteps(),
        DEFAULT_METRIC_STEP_CHECK_INTERVAL,
      );
    }

    if (this.failTime && this.startTime) {
      const elapsed = performance.now() - this.startTime - this.pausedDuration;
      const remaining = this.failTime - elapsed;

      if (remaining > 0) {
        this.metricTimeRunner = setTimeout(() => this.finish(false), remaining);
      } else {
        this.finish(false);
      }
    }
  }

  getStatus() {
    const now = performance.now();
    return {
      isRunning: this.isRunning,
      isDone: this.isDone,
      isPaused: this.isPaused,
      runningTime: this.startTime ? now - this.startTime - this.pausedDuration : 0,
      pausedDuration: this.pausedDuration,
      registeredMetrics: Array.from(this.metrics.keys()),
      completedMetrics: Array.from(this.metricsResults.entries()),
      pendingMetrics: this.steps.filter((step) => !this.metricsResults.has(step)),
      remainingTime:
        this.failTime && this.startTime
          ? Math.max(0, this.failTime - (now - this.startTime - this.pausedDuration))
          : undefined,
    };
  }

  private async checkSteps() {
    if (this.isCleaning || this.isPaused) {
      return;
    }

    const pendingChecks = Array.from(this.metrics.entries())
      .filter(([key]) => !this.metricsResults.has(key))
      .map(async ([key, metricFns]) => {
        if (metricFns.conditionFn && !metricFns.conditionFn()) {
          return;
        }
        try {
          const value = await Promise.resolve(metricFns.fn());
          this.metricsResults.set(key, value);
          if (this.log) {
            console.info('[SLO-metrics:checkSteps:result]', key, value);
          }
        } catch {
          this.metricsResults.set(key, false);
          if (this.log) {
            console.info('[SLO-metrics:checkSteps:error]', key, false);
          }
        }
      });

    if (pendingChecks.length === 0) {
      return;
    }

    await Promise.all(pendingChecks);

    if (this.log) {
      console.info('[SLO-metrics:checkSteps:results]', this.metricsResults);
    }
    this.checkMetricsResults();
  }

  private async finish(success: boolean) {
    if (this.isDone) {
      return;
    }

    this.isDone = true;

    queueMicrotask(() => {
      this.isRunning = false;

      this.cleanupCheckInterval();
      this.cleanupTimeout();

      const timestamp = Date.now();
      const duration = Math.round(
        performance.now() - (this.startTime ?? performance.now()) - this.pausedDuration,
      );

      const stepResults = new Map<string, boolean>();

      this.steps.forEach((el) => {
        const stepRes = this.metricsResults.get(el) || false;
        stepResults.set(el, stepRes);
      });
      if (success) {
        if (this.log) {
          console.info(
            '[SLO-metrics:finish]',
            'Success',
            new Date().toLocaleTimeString(),
            duration,
          );
        }
        this.onSuccess({
          timestamp,
          duration,
          steps: Object.fromEntries(stepResults),
        });
      } else {
        if (this.log) {
          console.info('[SLO-metrics:finish]', 'Fail', new Date().toLocaleTimeString(), duration);
        }
        this.onFail({
          timestamp,
          duration,
          steps: Object.fromEntries(stepResults),
        });
      }
    });
  }

  private checkMetricsResults() {
    if (this.isDone || this.isPaused) {
      return;
    }

    const allStepsProcessed = this.steps.every((step) => this.metricsResults.has(step));
    const allPassed = this.steps.every((step) => this.metricsResults.get(step) === true);

    if (allStepsProcessed || allPassed) {
      this.finish(allPassed);
    }
  }

  addMetricStep(key: T, fn: MetricFn, conditionFn?: ReadyToCheckConditionFn): MetricsCollector {
    if (this.isDone || !this.steps.includes(key) || this.metrics.has(key)) {
      return this;
    }

    if (!this.isRunning && !this.isPaused) {
      this.start();
    }

    this.metrics.set(key, { fn, conditionFn });

    if (this.log) {
      console.info('[SLO-metrics:addMetricStep]', key);
    }

    return this;
  }

  private cleanupTimeout() {
    if (this.metricTimeRunner) {
      clearTimeout(this.metricTimeRunner);
      this.metricTimeRunner = undefined;
    }
  }

  private cleanupCheckInterval() {
    this.isCleaning = true;
    if (this.metricStepsCheckInterval) {
      clearInterval(this.metricStepsCheckInterval);
      this.metricStepsCheckInterval = undefined;
    }
    this.isCleaning = false;
  }

  reset() {
    if (this.isCleaning) {
      return;
    }

    this.cleanupTimeout();
    this.cleanupCheckInterval();

    this.metrics.clear();
    this.metricsResults.clear();
    this.isDone = false;
    this.isRunning = false;
    this.isPaused = false;
    this.startTime = undefined;
    this.pausedDuration = 0;
    this.pauseStartTime = undefined;

    if (this.log) {
      console.info('[SLO-metrics:reset]');
    }
  }
}

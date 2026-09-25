import { LOG_PREFIX } from '../utils/logPrefix.ts';
import { StepCheck, StepReadinessCheck } from './types.ts';

export const STEP_CHECK_INTERVAL_MS = 100;

export type MetricsCollectorState = 'idle' | 'running' | 'paused' | 'finishing' | 'done';

interface RunClock {
  startTime: number;
  pausedDuration: number;
}

type RunState =
  | { kind: 'idle' }
  | {
      kind: 'running';
      clock: RunClock;
      checkInterval: ReturnType<typeof setInterval>;
      failTimer?: ReturnType<typeof setTimeout>;
    }
  | { kind: 'paused'; clock: RunClock; pausedAt: number }
  | { kind: 'finishing'; clock: RunClock }
  | { kind: 'done'; clock: RunClock; finishedAt: number };

type Outcome = 'success' | 'fail';

export interface MetricsCollectorConfig<T extends string = string> {
  failTime?: number;
  steps: T[];
  log?: boolean;
  onSuccess: (params: MetricsCollectorCallback<T>) => void;
  onFail: (params: MetricsCollectorCallback<T>) => void;
}

export interface MetricsCollectorStatus<T extends string = string> {
  state: MetricsCollectorState;
  runningTime: number;
  pausedDuration: number;
  remainingTime: number | undefined;
  registeredSteps: T[];
  completedSteps: [T, boolean][];
  pendingSteps: T[];
}

export interface MetricsCollectorCallback<T extends string = string> {
  timestamp: number;
  duration: number;
  steps: Record<T, boolean>;
}

export class MetricsCollector<T extends string = string> {
  private stepChecks = new Map<T, { fn: StepCheck; conditionFn?: StepReadinessCheck }>();

  private stepResults = new Map<T, boolean>();

  private checksInProgress = new Set<T>();

  private cycle = 0;

  private state: RunState = { kind: 'idle' };

  private readonly failTime?: number;

  private readonly steps: T[];

  private readonly log: boolean;

  private readonly onFail: (params: MetricsCollectorCallback<T>) => void;

  private readonly onSuccess: (params: MetricsCollectorCallback<T>) => void;

  constructor({ failTime, steps, onFail, onSuccess, log = false }: MetricsCollectorConfig<T>) {
    this.failTime = failTime;
    this.steps = steps;
    this.onFail = onFail;
    this.onSuccess = onSuccess;
    this.log = log;
  }

  start(): this {
    if (this.state.kind !== 'idle') {
      return this;
    }

    this.debug('start');
    this.run({ startTime: performance.now(), pausedDuration: 0 });
    this.scheduleFailTimer();
    return this;
  }

  pause(): this {
    if (this.state.kind !== 'running') {
      return this;
    }

    this.clearTimers();
    this.state = { kind: 'paused', clock: this.state.clock, pausedAt: performance.now() };

    this.debug('pause');
    return this;
  }

  resume(): this {
    if (this.state.kind !== 'paused') {
      return this;
    }

    const { clock, pausedAt } = this.state;
    this.debug('resume');

    this.run({ ...clock, pausedDuration: clock.pausedDuration + performance.now() - pausedAt });
    this.finishIfAllStepsChecked();
    this.checkSteps();
    this.scheduleFailTimer();
    return this;
  }

  getStatus(): MetricsCollectorStatus<T> {
    const { kind } = this.state;
    const runningTime = this.activeElapsed();
    const registeredSteps = Array.from(this.stepChecks.keys());
    const completedSteps = Array.from(this.stepResults.entries());
    const pendingSteps = this.steps.filter((step) => !this.stepResults.has(step));
    return {
      state: kind,
      runningTime,
      pausedDuration: kind === 'idle' ? 0 : this.state.clock.pausedDuration,
      remainingTime:
        this.failTime && kind !== 'idle' ? Math.max(0, this.failTime - runningTime) : undefined,
      registeredSteps,
      completedSteps,
      pendingSteps,
    };
  }

  addStep(key: T, fn: StepCheck, conditionFn?: StepReadinessCheck): this {
    if (this.isFinished() || !this.steps.includes(key) || this.stepChecks.has(key)) {
      return this;
    }

    this.start();
    this.stepChecks.set(key, { fn, conditionFn });

    this.debug('addStep', key);
    this.checkSteps();

    return this;
  }

  reset(): this {
    this.clearTimers();

    this.cycle++;
    this.state = { kind: 'idle' };
    this.stepChecks.clear();
    this.stepResults.clear();
    this.checksInProgress.clear();

    this.debug('reset');
    return this;
  }

  private isFinished() {
    return this.state.kind === 'finishing' || this.state.kind === 'done';
  }

  private activeElapsed() {
    const { state } = this;
    if (state.kind === 'idle') {
      return 0;
    }
    const end =
      state.kind === 'paused'
        ? state.pausedAt
        : state.kind === 'done'
          ? state.finishedAt
          : performance.now();
    return end - state.clock.startTime - state.clock.pausedDuration;
  }

  private run(clock: RunClock) {
    this.state = {
      kind: 'running',
      clock,
      checkInterval: setInterval(() => this.checkSteps(), STEP_CHECK_INTERVAL_MS),
    };
  }

  private scheduleFailTimer() {
    if (!this.failTime || this.state.kind !== 'running') {
      return;
    }

    const remaining = this.failTime - this.activeElapsed();
    if (remaining > 0) {
      this.state.failTimer = setTimeout(() => this.finish('fail'), remaining);
    } else {
      this.finish('fail');
    }
  }

  private clearTimers() {
    if (this.state.kind === 'running') {
      clearTimeout(this.state.failTimer);
      clearInterval(this.state.checkInterval);
    }
  }

  private async checkSteps() {
    if (this.state.kind === 'paused') {
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
    fn: StepCheck,
    conditionFn?: StepReadinessCheck,
  ): StepCheck | undefined {
    try {
      return !conditionFn || conditionFn() ? fn : undefined;
    } catch {
      this.debug('checkSteps:conditionError', key);
      return () => false;
    }
  }

  private async runCheck(key: T, fn: StepCheck): Promise<boolean> {
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
    if (this.state.kind !== 'running') {
      return;
    }

    if (this.steps.every((step) => this.stepResults.has(step))) {
      const allPassed = this.steps.every((step) => this.stepResults.get(step) === true);
      this.finish(allPassed ? 'success' : 'fail');
    }
  }

  private finish(outcome: Outcome) {
    if (this.state.kind !== 'running') {
      return;
    }

    this.clearTimers();
    const { clock } = this.state;
    this.state = { kind: 'finishing', clock };
    const cycle = this.cycle;

    queueMicrotask(() => {
      if (cycle !== this.cycle) {
        return;
      }
      this.state = { kind: 'done', clock, finishedAt: performance.now() };

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

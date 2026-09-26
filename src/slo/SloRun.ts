import { LOG_PREFIX } from '../utils/logPrefix';
import {
  SloRunOptions,
  SloRunResult,
  SloRunState,
  StepCheck,
  StepConfig,
  StepResults,
} from './types';

export const STEP_CHECK_INTERVAL_MS = 100;

export type SloRunConfig<S extends string> = SloRunOptions<S> & {
  onFinish: (result: SloRunResult<S>) => void;
};

interface Step {
  check: StepCheck;
  failAfterMs: number;
}

interface Clock {
  startTime: number;
  pausedDuration: number;
}

type Poll = ReturnType<typeof setInterval>;

type State =
  | { kind: 'waiting'; poll: Poll; startPaused: boolean }
  | { kind: 'running'; clock: Clock; poll: Poll; failTimer: ReturnType<typeof setTimeout> }
  | { kind: 'paused'; clock: Clock; pausedAt: number }
  | { kind: 'done' }
  | { kind: 'disposed' };

type LiveState = Extract<State, { kind: 'running' | 'paused' }>;

const elapsedMs = (clock: Clock, at: number) => at - clock.startTime - clock.pausedDuration;

const isThenable = (value: unknown): value is PromiseLike<unknown> =>
  typeof (value as { then?: unknown } | null)?.then === 'function';

export class SloRun<S extends string> {
  private readonly steps: Map<S, Step>;

  private readonly results = new Map<S, boolean>();

  private readonly checksInProgress = new Set<S>();

  private readonly reportedStepErrors = new Set<S>();

  private readonly failTime: number;

  private readonly startWhen: () => boolean;

  private readonly onFinish: (result: SloRunResult<S>) => void;

  private readonly logging: boolean;

  private current: State;

  constructor({ steps, failTime, startWhen = () => true, log = false, onFinish }: SloRunConfig<S>) {
    this.failTime = failTime;
    this.startWhen = startWhen;
    this.onFinish = onFinish;
    this.logging = log;
    this.steps = new Map(
      (Object.entries(steps) as [S, StepConfig][]).map(([name, config]) => {
        const { check, failTime: stepFailTime } =
          typeof config === 'function' ? { check: config, failTime: undefined } : config;
        return [name, { check, failAfterMs: Math.min(stepFailTime ?? failTime, failTime) }];
      }),
    );
    this.current = {
      kind: 'waiting',
      poll: setInterval(() => this.startIfConditionMet(), STEP_CHECK_INTERVAL_MS),
      startPaused: false,
    };
    this.startIfConditionMet();
  }

  get state(): SloRunState {
    return this.current.kind;
  }

  pause() {
    if (this.current.kind === 'waiting') {
      this.current = { ...this.current, startPaused: true };
      return;
    }
    if (this.current.kind !== 'running') {
      return;
    }
    this.clearTimers();
    this.current = { kind: 'paused', clock: this.current.clock, pausedAt: performance.now() };
    this.log('pause');
  }

  resume() {
    if (this.current.kind === 'waiting') {
      this.current = { ...this.current, startPaused: false };
      return;
    }
    if (this.current.kind !== 'paused') {
      return;
    }
    const { clock, pausedAt } = this.current;
    this.log('resume');
    this.run({ ...clock, pausedDuration: clock.pausedDuration + performance.now() - pausedAt });
  }

  dispose() {
    if (this.current.kind === 'disposed') {
      return;
    }
    this.clearTimers();
    this.current = { kind: 'disposed' };
    this.release();
    this.log('dispose');
  }

  private live(): LiveState | null {
    const { current } = this;
    return current.kind === 'running' || current.kind === 'paused' ? current : null;
  }

  private isStartConditionMet() {
    try {
      return this.startWhen();
    } catch {
      return false;
    }
  }

  private startIfConditionMet() {
    if (this.current.kind !== 'waiting' || !this.isStartConditionMet()) {
      return;
    }
    const { startPaused } = this.current;
    this.clearTimers();
    const now = performance.now();
    const clock = { startTime: now, pausedDuration: 0 };
    if (startPaused) {
      this.current = { kind: 'paused', clock, pausedAt: now };
      this.log('pause');
      return;
    }
    this.run(clock);
  }

  private run(clock: Clock) {
    const remaining = this.failTime - elapsedMs(clock, performance.now());
    this.current = {
      kind: 'running',
      clock,
      poll: setInterval(() => this.checkSteps(), STEP_CHECK_INTERVAL_MS),
      failTimer: setTimeout(() => this.finish(), Math.max(0, remaining)),
    };
    this.log('running');
    this.checkSteps();
  }

  private checkSteps() {
    if (this.current.kind !== 'running') {
      return;
    }
    const sinceStart = elapsedMs(this.current.clock, performance.now());
    for (const [name, step] of this.steps) {
      if (this.results.has(name)) {
        continue;
      }
      if (sinceStart >= step.failAfterMs) {
        this.record(name, false);
      } else if (!this.checksInProgress.has(name)) {
        this.runCheck(name, step.check);
      }
    }
    this.finishIfAllStepsChecked();
  }

  private runCheck(name: S, check: StepCheck) {
    let outcome: unknown;
    try {
      outcome = check();
    } catch (error) {
      this.logStepError(name, error);
      return;
    }
    if (!isThenable(outcome)) {
      if (outcome) {
        this.record(name, true);
      }
      return;
    }
    this.checksInProgress.add(name);
    Promise.resolve(outcome)
      .then(
        (passed) => {
          if (passed) {
            this.record(name, true);
            this.finishIfAllStepsChecked();
          }
        },
        (error) => this.logStepError(name, error),
      )
      .finally(() => this.checksInProgress.delete(name));
  }

  private record(name: S, passed: boolean) {
    if (!this.live() || this.results.has(name)) {
      return;
    }
    this.results.set(name, passed);
    this.log('step', name, passed);
  }

  private finishIfAllStepsChecked() {
    if (this.results.size === this.steps.size) {
      this.finish();
    }
  }

  private finish() {
    const live = this.live();
    if (!live) {
      return;
    }
    const finishedAt = live.kind === 'paused' ? live.pausedAt : performance.now();
    this.clearTimers();
    this.current = { kind: 'done' };

    const steps = Object.fromEntries(
      Array.from(this.steps.keys()).map((name) => [name, this.results.get(name) ?? false]),
    ) as StepResults<S>;
    const result: SloRunResult<S> = {
      timestamp: Date.now(),
      duration: Math.round(elapsedMs(live.clock, finishedAt)),
      passed: Object.values(steps).every(Boolean),
      steps,
    };
    this.release();
    this.log('finish', result.duration, result.steps);
    this.onFinish(result);
  }

  private release() {
    this.steps.clear();
    this.results.clear();
    this.checksInProgress.clear();
    this.reportedStepErrors.clear();
  }

  private clearTimers() {
    if ('poll' in this.current) {
      clearInterval(this.current.poll);
    }
    if (this.current.kind === 'running') {
      clearTimeout(this.current.failTimer);
    }
  }

  private logStepError(name: S, error: unknown) {
    if (this.reportedStepErrors.has(name)) {
      return;
    }
    this.reportedStepErrors.add(name);
    this.log('step-error', name, error);
  }

  private log(event: string, ...details: unknown[]) {
    if (this.logging) {
      console.info(LOG_PREFIX, `slo:${event}`, ...details);
    }
  }
}

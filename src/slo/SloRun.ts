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
  deadline: number;
}

interface Clock {
  startTime: number;
  pausedDuration: number;
}

type Poll = ReturnType<typeof setInterval>;

type State =
  | { kind: 'waiting'; poll: Poll }
  | { kind: 'running'; clock: Clock; poll: Poll; failTimer: ReturnType<typeof setTimeout> }
  | { kind: 'paused'; clock: Clock; pausedAt: number }
  | { kind: 'done' }
  | { kind: 'disposed' };

const elapsed = (clock: Clock, at: number) => at - clock.startTime - clock.pausedDuration;

export class SloRun<S extends string> {
  private readonly steps: Map<S, Step>;

  private readonly results = new Map<S, boolean>();

  private readonly checksInProgress = new Set<S>();

  private readonly failTime: number;

  private readonly startWhen: () => boolean;

  private readonly onFinish: (result: SloRunResult<S>) => void;

  private readonly log: boolean;

  private hidden = false;

  private current: State;

  constructor({ steps, failTime, startWhen = () => true, log = false, onFinish }: SloRunConfig<S>) {
    this.failTime = failTime;
    this.startWhen = startWhen;
    this.onFinish = onFinish;
    this.log = log;
    this.steps = new Map(
      (Object.entries(steps) as [S, StepConfig][]).map(([name, config]) => {
        const { check, failTime: stepFailTime } =
          typeof config === 'function' ? { check: config, failTime: undefined } : config;
        return [name, { check, deadline: Math.min(stepFailTime ?? failTime, failTime) }];
      }),
    );
    this.current = {
      kind: 'waiting',
      poll: setInterval(() => this.startIfConditionMet(), STEP_CHECK_INTERVAL_MS),
    };
    this.startIfConditionMet();
  }

  get state(): SloRunState {
    return this.current.kind;
  }

  pause() {
    this.hidden = true;
    if (this.current.kind !== 'running') {
      return;
    }
    this.clearTimers();
    this.current = { kind: 'paused', clock: this.current.clock, pausedAt: performance.now() };
    this.debug('pause');
  }

  resume() {
    this.hidden = false;
    if (this.current.kind !== 'paused') {
      return;
    }
    const { clock, pausedAt } = this.current;
    this.debug('resume');
    this.run({ ...clock, pausedDuration: clock.pausedDuration + performance.now() - pausedAt });
  }

  dispose() {
    if (this.current.kind === 'disposed') {
      return;
    }
    this.clearTimers();
    this.current = { kind: 'disposed' };
    this.release();
    this.debug('dispose');
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
    this.clearTimers();
    this.run({ startTime: performance.now(), pausedDuration: 0 });
  }

  private run(clock: Clock) {
    const remaining = this.failTime - elapsed(clock, performance.now());
    this.current = {
      kind: 'running',
      clock,
      poll: setInterval(() => this.checkSteps(), STEP_CHECK_INTERVAL_MS),
      failTimer: setTimeout(() => this.finish(), Math.max(0, remaining)),
    };
    if (this.hidden) {
      this.pause();
      return;
    }
    this.debug('running');
    this.checkSteps();
  }

  private checkSteps() {
    if (this.current.kind !== 'running') {
      return;
    }
    const now = elapsed(this.current.clock, performance.now());
    for (const [name, step] of this.steps) {
      if (this.results.has(name)) {
        continue;
      }
      if (now >= step.deadline) {
        this.record(name, false);
      } else if (!this.checksInProgress.has(name)) {
        this.runCheck(name, step.check);
      }
    }
    this.finishIfAllStepsChecked();
  }

  private runCheck(name: S, check: StepCheck) {
    let outcome: boolean | Promise<boolean>;
    try {
      outcome = check();
    } catch {
      return;
    }
    if (typeof outcome === 'boolean') {
      if (outcome) {
        this.record(name, true);
      }
      return;
    }
    this.checksInProgress.add(name);
    outcome
      .then((passed) => {
        if (passed) {
          this.record(name, true);
          this.finishIfAllStepsChecked();
        }
      })
      .catch(() => {})
      .finally(() => this.checksInProgress.delete(name));
  }

  private record(name: S, passed: boolean) {
    const accepting = this.current.kind === 'running' || this.current.kind === 'paused';
    if (!accepting || this.results.has(name)) {
      return;
    }
    this.results.set(name, passed);
    this.debug('step', name, passed);
  }

  private finishIfAllStepsChecked() {
    if (this.results.size === this.steps.size) {
      this.finish();
    }
  }

  private finish() {
    if (this.current.kind !== 'running' && this.current.kind !== 'paused') {
      return;
    }
    const { clock } = this.current;
    const finishedAt = this.current.kind === 'paused' ? this.current.pausedAt : performance.now();
    this.clearTimers();
    this.current = { kind: 'done' };

    const steps = Object.fromEntries(
      Array.from(this.steps.keys()).map((name) => [name, this.results.get(name) ?? false]),
    ) as StepResults<S>;
    const result: SloRunResult<S> = {
      timestamp: Date.now(),
      duration: Math.round(elapsed(clock, finishedAt)),
      passed: Object.values(steps).every(Boolean),
      steps,
    };
    this.release();
    this.debug('finish', result.duration, result.steps);
    this.onFinish(result);
  }

  private release() {
    this.steps.clear();
    this.results.clear();
    this.checksInProgress.clear();
  }

  private clearTimers() {
    if ('poll' in this.current) {
      clearInterval(this.current.poll);
    }
    if (this.current.kind === 'running') {
      clearTimeout(this.current.failTimer);
    }
  }

  private debug(event: string, ...details: unknown[]) {
    if (this.log) {
      console.info(LOG_PREFIX, `slo:${event}`, ...details);
    }
  }
}

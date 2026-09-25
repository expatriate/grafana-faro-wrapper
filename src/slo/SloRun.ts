import { LOG_PREFIX } from '../utils/logPrefix.ts';
import { SloRunResult, SloRunState, StepCheck, StepConfig, StepResults } from './types.ts';

export const STEP_CHECK_INTERVAL_MS = 100;

export interface SloRunConfig<S extends string> {
  steps: Record<S, StepConfig>;
  failTime: number;
  startWhen?: () => boolean;
  onFinish: (result: SloRunResult<S>) => void;
  log?: boolean;
}

interface Step {
  check: StepCheck;
  deadline: number;
}

interface Clock {
  startTime: number;
  pausedDuration: number;
}

type State =
  | { kind: 'idle' }
  | { kind: 'waiting'; poll: ReturnType<typeof setInterval>; pauseRequested: boolean }
  | {
      kind: 'running';
      clock: Clock;
      tick: ReturnType<typeof setInterval>;
      failTimer: ReturnType<typeof setTimeout>;
    }
  | { kind: 'paused'; clock: Clock; pausedAt: number }
  | { kind: 'done'; clock: Clock; finishedAt: number }
  | { kind: 'disposed' };

export class SloRun<S extends string> {
  private readonly steps: Map<S, Step>;

  private readonly results = new Map<S, boolean>();

  private readonly checksInProgress = new Set<S>();

  private readonly failTime: number;

  private readonly startWhen?: () => boolean;

  private readonly onFinish: (result: SloRunResult<S>) => void;

  private readonly log: boolean;

  private current: State = { kind: 'idle' };

  constructor({ steps, failTime, startWhen, onFinish, log = false }: SloRunConfig<S>) {
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
  }

  get state(): SloRunState {
    return this.current.kind === 'idle' ? 'waiting' : this.current.kind;
  }

  start() {
    if (this.current.kind !== 'idle') {
      return;
    }
    if (this.startWhen && !this.isStartConditionMet()) {
      this.current = {
        kind: 'waiting',
        poll: setInterval(() => this.startIfConditionMet(), STEP_CHECK_INTERVAL_MS),
        pauseRequested: false,
      };
      this.debug('waiting');
      return;
    }
    this.run({ startTime: performance.now(), pausedDuration: 0 });
  }

  pause() {
    if (this.current.kind === 'waiting') {
      this.current.pauseRequested = true;
      return;
    }
    if (this.current.kind !== 'running') {
      return;
    }
    this.clearTimers();
    this.current = { kind: 'paused', clock: this.current.clock, pausedAt: performance.now() };
    this.debug('pause');
  }

  resume() {
    if (this.current.kind === 'waiting') {
      this.current.pauseRequested = false;
      return;
    }
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
    this.debug('dispose');
  }

  private isStartConditionMet() {
    try {
      return this.startWhen!();
    } catch {
      return false;
    }
  }

  private startIfConditionMet() {
    if (this.current.kind !== 'waiting' || !this.isStartConditionMet()) {
      return;
    }
    const { pauseRequested } = this.current;
    this.clearTimers();
    this.run({ startTime: performance.now(), pausedDuration: 0 });
    if (pauseRequested) {
      this.pause();
    }
  }

  private run(clock: Clock) {
    const remaining = this.failTime - (performance.now() - clock.startTime - clock.pausedDuration);
    this.current = {
      kind: 'running',
      clock,
      tick: setInterval(() => this.checkSteps(), STEP_CHECK_INTERVAL_MS),
      failTimer: setTimeout(() => this.finish(), Math.max(0, remaining)),
    };
    this.debug('running');
    this.checkSteps();
  }

  private activeElapsed() {
    const { current } = this;
    if (current.kind === 'idle' || current.kind === 'waiting' || current.kind === 'disposed') {
      return 0;
    }
    const end =
      current.kind === 'paused'
        ? current.pausedAt
        : current.kind === 'done'
          ? current.finishedAt
          : performance.now();
    return end - current.clock.startTime - current.clock.pausedDuration;
  }

  private checkSteps() {
    if (this.current.kind !== 'running') {
      return;
    }
    const elapsed = this.activeElapsed();
    for (const [name, step] of this.steps) {
      if (this.results.has(name)) {
        continue;
      }
      if (elapsed >= step.deadline) {
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
    if (
      this.results.has(name) ||
      this.current.kind === 'disposed' ||
      this.current.kind === 'done'
    ) {
      return;
    }
    this.results.set(name, passed);
    this.debug('step', name, passed);
  }

  private finishIfAllStepsChecked() {
    const allChecked = Array.from(this.steps.keys()).every((name) => this.results.has(name));
    if (allChecked) {
      this.finish();
    }
  }

  private finish() {
    if (this.current.kind !== 'running' && this.current.kind !== 'paused') {
      return;
    }
    const finishedAt = this.current.kind === 'paused' ? this.current.pausedAt : performance.now();
    const { clock } = this.current;
    this.clearTimers();
    this.current = { kind: 'done', clock, finishedAt };

    const result: SloRunResult<S> = {
      timestamp: Date.now(),
      duration: Math.round(this.activeElapsed()),
      steps: Object.fromEntries(
        Array.from(this.steps.keys()).map((name) => [name, this.results.get(name) ?? false]),
      ) as StepResults<S>,
    };
    this.debug('finish', result.duration, result.steps);
    this.onFinish(result);
  }

  private clearTimers() {
    if (this.current.kind === 'waiting') {
      clearInterval(this.current.poll);
    } else if (this.current.kind === 'running') {
      clearInterval(this.current.tick);
      clearTimeout(this.current.failTimer);
    }
  }

  private debug(event: string, ...details: unknown[]) {
    if (this.log) {
      console.info(LOG_PREFIX, `slo:${event}`, ...details);
    }
  }
}

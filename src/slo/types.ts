export type StepCheck = () => boolean | Promise<boolean>;

export type StepConfig = StepCheck | { check: StepCheck; failTime?: number };

export type StepResults<S extends string> = Record<S, boolean>;

export type SloRunState = 'waiting' | 'running' | 'paused' | 'done' | 'disposed';

export interface SloRunOptions<S extends string> {
  steps: Record<S, StepConfig>;
  failTime: number;
  startWhen?: () => boolean;
  log?: boolean;
}

export interface SloRunResult<S extends string> {
  timestamp: number;
  duration: number;
  passed: boolean;
  steps: StepResults<S>;
}

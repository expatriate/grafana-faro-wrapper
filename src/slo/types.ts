export type StepCheck = () => boolean | Promise<boolean>;

export type StepConfig = StepCheck | { check: StepCheck; failTime?: number };

export type StepResults<S extends string> = Record<S, boolean>;

export type SloRunState = 'waiting' | 'running' | 'paused' | 'done' | 'disposed';

export interface SloRunResult<S extends string> {
  timestamp: number;
  duration: number;
  steps: StepResults<S>;
}

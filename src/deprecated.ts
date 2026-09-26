import type * as Slo from './slo/types';

/** @deprecated Internal options of the SLO run; use `SloConfig`. Removed in 2.0. */
export type SloRunOptions<S extends string> = Slo.SloRunOptions<S>;

/** @deprecated No public API returns it; the result is sent as a `Metric`. Removed in 2.0. */
export type SloRunResult<S extends string> = Slo.SloRunResult<S>;

/** @deprecated No public API returns it. Removed in 2.0. */
export type StepResults<S extends string> = Slo.StepResults<S>;

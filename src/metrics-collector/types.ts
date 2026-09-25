export type StepCheck = () => Promise<boolean> | boolean;
export type StepReadinessCheck = () => boolean;

/** @deprecated Use StepCheck. */
export type MetricFn = StepCheck;
/** @deprecated Use StepReadinessCheck. */
export type ReadyToCheckConditionFn = StepReadinessCheck;

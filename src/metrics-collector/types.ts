export type MetricFn = () => Promise<boolean> | boolean;
export type ReadyToCheckConditionFn = () => boolean;

export type MetricLabels = Record<string, string | number | boolean>;

export type MetricUnit =
  | 'BYTES'
  | 'MILLISECONDS'
  | 'SECONDS'
  | 'REQUESTS'
  | 'ERRORS'
  | 'OPERATIONS'
  | 'EVENTS'
  | 'UNITLESS';

export type MetricType = 'histogram' | 'counter' | 'gauge';

export type MetricResult = 'success' | 'fail';

export interface Metric {
  name: string;
  value: number;
  unit: MetricUnit;
  type: MetricType;
  result?: MetricResult;
  labels?: MetricLabels;
  buckets?: number[];
  description?: string;
  timestamp?: number;
}

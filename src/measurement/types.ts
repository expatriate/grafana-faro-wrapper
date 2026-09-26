export type MetricLabels = Record<string, string | number | boolean>;

export const METRIC_UNITS = [
  'BYTES',
  'MILLISECONDS',
  'SECONDS',
  'REQUESTS',
  'ERRORS',
  'OPERATIONS',
  'EVENTS',
  'UNITLESS',
] as const;

export type MetricUnit = (typeof METRIC_UNITS)[number];

export const METRIC_TYPES = ['histogram', 'counter', 'gauge'] as const;

export type MetricType = (typeof METRIC_TYPES)[number];

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

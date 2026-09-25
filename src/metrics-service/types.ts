export type CustomMetricBase = {
  timestamp?: number;
  name: string;
  value: string | number;
  description: string;
  unit: MetricUnit;
  labels?: MetricLabel;
  type: MetricType;
  status?: string;
  result?: string;
  buckets?: (number | string)[];
};

export type MetricUnit =
  | 'BYTES'
  | 'MILLISECONDS'
  | 'SECONDS'
  | 'REQUESTS'
  | 'ERRORS'
  | 'OPERATIONS'
  | 'EVENTS'
  | 'UNITLESS';

export type MetricLabel = Record<string, string | Record<string, string>>;

export type MetricType = 'histogram' | 'counter' | 'gauge';

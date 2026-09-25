export type CustomMetric = {
  timestamp?: number;
  name: string;
  value: string | number;
  description: string;
  unit: MetricUnit;
  labels?: MetricLabels;
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

export type MetricLabels = Record<string, string | Record<string, string>>;

export type MetricType = 'histogram' | 'counter' | 'gauge';

/** @deprecated Use CustomMetric. */
export type CustomMetricBase = CustomMetric;
/** @deprecated Use MetricLabels. */
export type MetricLabel = MetricLabels;

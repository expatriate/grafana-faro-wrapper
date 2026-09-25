export { FaroRoute, FaroRoutes, withFaroRouterInstrumentation } from '@grafana/faro-react';
export { FaroService } from './faro-service/FaroService.ts';
export type { FaroConfig, Sanitizer } from './faro-service/FaroService.ts';
export { MetricsCollector } from './metrics-collector/MetricsCollector.ts';
export type {
  MetricsCollectorCallback,
  MetricsCollectorConfig,
} from './metrics-collector/MetricsCollector.ts';
export type * from './metrics-collector/types.ts';
export { MetricsService } from './metrics-service/MetricsService.ts';
export type * from './metrics-service/types.ts';

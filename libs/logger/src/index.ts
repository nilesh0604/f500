export { createLogger, logger, maskObjectPii } from './lib/logger';
export { httpLogMiddleware } from './lib/http-log.middleware';
export type { LogContext } from './lib/logger';
export {
  initTracing,
  getTraceContext,
  getActiveSpan,
  withSpan,
  context as otelContext,
  trace as otelTrace,
  SpanStatusCode,
} from './lib/tracer';
export type { Span } from './lib/tracer';
export {
  recordRedMetrics,
  recordBusinessMetric,
  recordSqsProcessingMetrics,
} from './lib/metrics';
export type { RedMetrics, BusinessMetric } from './lib/metrics';

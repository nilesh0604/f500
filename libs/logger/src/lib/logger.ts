import winston from 'winston';
import { getTraceContext } from './tracer';

export interface LogContext {
  correlationId?: string;
  userId?: string;
  service?: string;
  [key: string]: unknown;
}

const PII_PATTERNS: RegExp[] = [
  /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi,
  /\b(\+?1[-.\s]?)?(\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4})\b/g,
  /\b\d{3}-\d{2}-\d{4}\b/g,
  /\b(?:4[0-9]{12}(?:[0-9]{3})?|5[1-5][0-9]{14}|3[47][0-9]{13})\b/g,
  /\b(?:25[0-5]|2[0-4]\d|[01]?\d\d?)(?:\.(?:25[0-5]|2[0-4]\d|[01]?\d\d?)){3}\b/g,
];

const PII_FIELD_NAMES = new Set([
  'email',
  'phone',
  'address',
  'ssn',
  'creditCard',
  'password',
  'token',
  'secret',
  'authorization',
]);

const maskPii = (message: string): string =>
  PII_PATTERNS.reduce(
    (msg, pattern) => msg.replace(pattern, '[REDACTED]'),
    message
  );

const maskObjectPii = (
  obj: Record<string, unknown>
): Record<string, unknown> => {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (PII_FIELD_NAMES.has(key.toLowerCase())) {
      result[key] = '[REDACTED]';
    } else if (typeof value === 'string') {
      result[key] = maskPii(value);
    } else if (value !== null && typeof value === 'object') {
      result[key] = maskObjectPii(value as Record<string, unknown>);
    } else {
      result[key] = value;
    }
  }
  return result;
};

const maskTransform = winston.format(info => {
  if (typeof info.message === 'string') {
    info.message = maskPii(info.message);
  }
  return info;
});

const traceContextTransform = winston.format(info => {
  const { traceId, spanId } = getTraceContext();
  if (traceId) info['traceId'] = traceId;
  if (spanId) info['spanId'] = spanId;
  return info;
});

const LOG_LEVEL_ROUTING: Record<string, string> = {
  error: 'pagerduty',
  warn: 'slack',
  info: 'cloudwatch',
};

const routingTransform = winston.format(info => {
  const level = info.level as string;
  if (LOG_LEVEL_ROUTING[level]) {
    info['_routing'] = LOG_LEVEL_ROUTING[level];
  }
  return info;
});

export const createLogger = (service: string): winston.Logger =>
  winston.createLogger({
    level: process.env['LOG_LEVEL'] ?? 'info',
    format: winston.format.combine(
      maskTransform(),
      traceContextTransform(),
      routingTransform(),
      winston.format.timestamp(),
      winston.format.errors({ stack: true }),
      winston.format.json()
    ),
    defaultMeta: { service },
    transports: [new winston.transports.Console()],
  });

export const logger = createLogger(process.env['SERVICE_NAME'] ?? 'orderflow');

export const childLogger = (
  base: winston.Logger,
  context: LogContext
): winston.Logger => base.child(context);

export { maskObjectPii };

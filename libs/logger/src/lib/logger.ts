import winston from 'winston';

export interface LogContext {
  correlationId?: string;
  userId?: string;
  service?: string;
  [key: string]: unknown;
}

const PII_PATTERNS = [/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi];

const maskPii = (message: string): string =>
  PII_PATTERNS.reduce(
    (msg, pattern) => msg.replace(pattern, '[REDACTED]'),
    message
  );

const maskTransform = winston.format(info => {
  if (typeof info.message === 'string') {
    info.message = maskPii(info.message);
  }
  return info;
});

export const createLogger = (service: string): winston.Logger =>
  winston.createLogger({
    level: process.env['LOG_LEVEL'] ?? 'info',
    format: winston.format.combine(
      maskTransform(),
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

/**
 * Structured Winston logger for vyasa-slack-cmd.
 * Outputs JSON for CloudWatch Logs consumption.
 * NOTE: @orderflow/logger lib is not yet created; using local logger per Vyasa convention.
 */

import winston from 'winston';

const { combine, timestamp, json, errors } = winston.format;
const logLevel = process.env.LOG_LEVEL || 'info';

export const logger = winston.createLogger({
  level: logLevel,
  defaultMeta: { service: 'vyasa-slack-cmd' },
  format: combine(timestamp(), errors({ stack: true }), json()),
  transports: [new winston.transports.Console()],
});

/**
 * Create a child logger with a correlation ID for request tracing.
 */
export function createRequestLogger(correlationId: string): winston.Logger {
  return logger.child({ correlationId });
}

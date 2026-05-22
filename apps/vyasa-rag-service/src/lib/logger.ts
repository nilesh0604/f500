/**
 * Structured Winston logger for Vyasa RAG Service
 * Outputs JSON for CloudWatch Logs consumption
 */

import winston from 'winston';

const { combine, timestamp, json, errors } = winston.format;

const logLevel = process.env.LOG_LEVEL || 'info';

export const logger = winston.createLogger({
  level: logLevel,
  defaultMeta: {
    service: 'vyasa-rag',
    environment: process.env.NODE_ENV || 'development',
  },
  format: combine(timestamp(), errors({ stack: true }), json()),
  transports: [new winston.transports.Console()],
});

/**
 * Create a child logger with request context
 */
export function createRequestLogger(correlationId: string, sessionId?: string) {
  return logger.child({
    correlationId,
    sessionId,
  });
}

/**
 * Log agent step for debugging
 */
export function logAgentStep(
  logger: winston.Logger,
  step: number,
  type: string,
  content: string,
  metadata?: Record<string, unknown>
) {
  logger.debug('Agent step', {
    step,
    type,
    content,
    ...metadata,
  });
}

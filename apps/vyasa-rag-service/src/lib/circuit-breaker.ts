/**
 * Circuit breaker pattern for external service calls
 * Protects against cascading failures
 */

import { CircuitState, CircuitBreakerConfig } from '../types';
import { logger } from './logger';

export class CircuitBreaker {
  private state: CircuitState = 'closed';
  private failures = 0;
  private lastFailureTime = 0;
  private halfOpenCalls = 0;

  constructor(
    private readonly name: string,
    private readonly config: CircuitBreakerConfig = {
      failureThreshold: 5,
      resetTimeoutMs: 30000,
      halfOpenMaxCalls: 3,
    },
    private readonly fallbackFn?: () => Promise<unknown>
  ) {}

  /**
   * Execute function with circuit breaker protection
   */
  async execute<T>(fn: () => Promise<T>, context?: string): Promise<T> {
    if (this.state === 'open') {
      if (this.shouldAttemptReset()) {
        this.state = 'half-open';
        this.halfOpenCalls = 0;
        logger.info(`Circuit breaker '${this.name}' entering half-open state`, {
          context,
        });
      } else {
        const error = new Error(`Circuit breaker '${this.name}' is open`);
        if (this.fallbackFn) {
          logger.warn(`Circuit breaker '${this.name}' open, using fallback`, {
            context,
          });
          return this.fallbackFn() as unknown as Promise<T>;
        }
        throw error;
      }
    }

    if (
      this.state === 'half-open' &&
      this.halfOpenCalls >= this.config.halfOpenMaxCalls
    ) {
      throw new Error(`Circuit breaker '${this.name}' half-open limit reached`);
    }

    if (this.state === 'half-open') {
      this.halfOpenCalls++;
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  /**
   * Get current circuit state
   */
  getState(): CircuitState {
    return this.state;
  }

  /**
   * Manually reset circuit (for testing)
   */
  reset(): void {
    this.state = 'closed';
    this.failures = 0;
    this.halfOpenCalls = 0;
    logger.info(`Circuit breaker '${this.name}' manually reset`);
  }

  private shouldAttemptReset(): boolean {
    const now = Date.now();
    return now - this.lastFailureTime >= this.config.resetTimeoutMs;
  }

  private onSuccess(): void {
    if (this.state === 'half-open') {
      this.state = 'closed';
      this.failures = 0;
      this.halfOpenCalls = 0;
      logger.info(
        `Circuit breaker '${this.name}' closed after successful half-open call`
      );
    }
  }

  private onFailure(): void {
    this.failures++;
    this.lastFailureTime = Date.now();

    if (this.failures >= this.config.failureThreshold) {
      this.state = 'open';
      logger.error(
        `Circuit breaker '${this.name}' opened after ${this.failures} failures`
      );
    }
  }
}

/**
 * Pre-configured circuit breakers for common services
 */
export const bedrockCircuitBreaker = new CircuitBreaker(
  'bedrock',
  { failureThreshold: 3, resetTimeoutMs: 30000, halfOpenMaxCalls: 2 },
  async () =>
    Promise.resolve({
      answer: "I'm temporarily unable to search. Please try again shortly.",
      citations: [],
      context: '',
      tokenUsage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
      retrievedResults: [],
    }) as Promise<unknown>
);

export const dynamodbCircuitBreaker = new CircuitBreaker('dynamodb', {
  failureThreshold: 5,
  resetTimeoutMs: 15000,
  halfOpenMaxCalls: 3,
});

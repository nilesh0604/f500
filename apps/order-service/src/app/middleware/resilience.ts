import CircuitBreaker from 'opossum';
import { createLogger } from '@orderflow/logger';

const log = createLogger('order-service:resilience');

/** Jitter ±25 % of the base delay to prevent thundering-herd. */
const jitter = (ms: number): number => ms * (0.75 + Math.random() * 0.5);

/**
 * Retry with exponential backoff + jitter.
 * @param fn   Async operation to attempt.
 * @param opts.maxAttempts   Maximum attempts (default 3).
 * @param opts.baseDelayMs   Initial backoff in ms (default 200).
 * @param opts.timeoutMs     Per-attempt timeout in ms (default 5000).
 */
export const retryWithBackoff = async <T>(
  fn: () => Promise<T>,
  opts: { maxAttempts?: number; baseDelayMs?: number; timeoutMs?: number } = {}
): Promise<T> => {
  const { maxAttempts = 3, baseDelayMs = 200, timeoutMs = 5000 } = opts;

  let lastError: Error = new Error('retryWithBackoff: no attempts made');

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const result = await Promise.race<T>([
        fn(),
        new Promise<never>((_, reject) =>
          setTimeout(
            () => reject(new Error(`Timeout after ${timeoutMs}ms`)),
            timeoutMs
          )
        ),
      ]);
      return result;
    } catch (err) {
      lastError = err as Error;
      if (attempt < maxAttempts) {
        const delay = jitter(baseDelayMs * 2 ** (attempt - 1));
        log.warn('Retrying after backoff', {
          attempt,
          maxAttempts,
          delayMs: Math.round(delay),
          error: lastError.message,
        });
        await new Promise(r => setTimeout(r, delay));
      }
    }
  }

  throw lastError;
};

/**
 * Creates an opossum circuit-breaker wrapping the provided async function.
 *
 * Defaults:
 *  - 50 % failure threshold before opening
 *  - 5 s reset timeout
 *  - 5 s per-call timeout
 *  - 5 calls minimum before trip evaluation (rolling window)
 */
export const createCircuitBreaker = <TArgs extends unknown[], TReturn>(
  fn: (...args: TArgs) => Promise<TReturn>,
  name: string,
  overrides: Partial<CircuitBreaker.Options> = {}
): CircuitBreaker<TArgs, TReturn> => {
  const breaker = new CircuitBreaker(fn, {
    name,
    errorThresholdPercentage: 50,
    resetTimeout: 5000,
    timeout: 5000,
    volumeThreshold: 5,
    ...overrides,
  });

  breaker.on('open', () => log.warn('Circuit breaker OPEN', { name }));
  breaker.on('halfOpen', () =>
    log.info('Circuit breaker HALF-OPEN — probing', { name })
  );
  breaker.on('close', () =>
    log.info('Circuit breaker CLOSED — healthy', { name })
  );
  breaker.on('fallback', (result: unknown) =>
    log.warn('Circuit breaker fallback fired', { name, result })
  );

  return breaker;
};

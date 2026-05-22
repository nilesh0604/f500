/**
 * Unit tests for circuit breaker
 */

import { CircuitBreaker } from '../../src/lib/circuit-breaker';

describe('CircuitBreaker', () => {
  let circuitBreaker: CircuitBreaker;

  beforeEach(() => {
    circuitBreaker = new CircuitBreaker('test', {
      failureThreshold: 3,
      resetTimeoutMs: 100,
      halfOpenMaxCalls: 2,
    });
  });

  describe('execute', () => {
    it('should execute successful function', async () => {
      const fn = jest.fn().mockResolvedValue('success');

      const result = await circuitBreaker.execute(fn);

      expect(result).toBe('success');
      expect(fn).toHaveBeenCalled();
    });

    it('should track failures', async () => {
      const fn = jest.fn().mockRejectedValue(new Error('error'));

      try {
        await circuitBreaker.execute(fn);
      } catch {
        // expected
      }

      expect(circuitBreaker.getState()).toBe('closed');
    });

    it('should open after threshold failures', async () => {
      const fn = jest.fn().mockRejectedValue(new Error('error'));

      // Fail 3 times
      for (let i = 0; i < 3; i++) {
        try {
          await circuitBreaker.execute(fn);
        } catch {
          // expected
        }
      }

      expect(circuitBreaker.getState()).toBe('open');
    });

    it('should use fallback when open', async () => {
      const fallback = jest.fn().mockResolvedValue('fallback');
      const breaker = new CircuitBreaker(
        'test',
        { failureThreshold: 1, resetTimeoutMs: 1000, halfOpenMaxCalls: 1 },
        fallback
      );

      // Trigger failure
      const failingFn = jest.fn().mockRejectedValue(new Error('error'));
      try {
        await breaker.execute(failingFn);
      } catch {
        // expected
      }

      // Next call should use fallback
      const result = await breaker.execute(failingFn);
      expect(result).toBe('fallback');
      expect(fallback).toHaveBeenCalled();
    });

    it('should reset manually', async () => {
      const fn = jest.fn().mockRejectedValue(new Error('error'));

      // Trigger failure
      try {
        await circuitBreaker.execute(fn);
      } catch {
        // expected
      }

      circuitBreaker.reset();
      expect(circuitBreaker.getState()).toBe('closed');
    });
  });

  describe('getState', () => {
    it('should start in closed state', () => {
      expect(circuitBreaker.getState()).toBe('closed');
    });
  });
});

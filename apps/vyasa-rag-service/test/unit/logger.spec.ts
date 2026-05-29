/**
 * Unit tests for logger utilities
 */

import winston from 'winston';

// We need to test the actual logger module exports
// Import after jest setup
import { createRequestLogger, logAgentStep } from '../../src/lib/logger';

describe('Logger', () => {
  describe('createRequestLogger', () => {
    it('should_returnChildLogger_when_correlationIdProvided', () => {
      const requestLogger = createRequestLogger('corr-id-123');
      expect(requestLogger).toBeDefined();
      expect(typeof requestLogger.info).toBe('function');
      expect(typeof requestLogger.error).toBe('function');
    });

    it('should_returnChildLogger_when_sessionIdAlsoProvided', () => {
      const requestLogger = createRequestLogger('corr-id-456', 'session-789');
      expect(requestLogger).toBeDefined();
      expect(typeof requestLogger.debug).toBe('function');
      expect(typeof requestLogger.warn).toBe('function');
    });
  });

  describe('logAgentStep', () => {
    it('should_logDebugMessage_when_called', () => {
      const mockLogger = {
        debug: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
      } as unknown as winston.Logger;

      logAgentStep(mockLogger, 1, 'thought', 'Analyzing query about Karna');
      expect(mockLogger.debug).toHaveBeenCalledWith('Agent step', {
        step: 1,
        type: 'thought',
        content: 'Analyzing query about Karna',
      });
    });

    it('should_includeMetadata_when_metadataProvided', () => {
      const mockLogger = {
        debug: jest.fn(),
      } as unknown as winston.Logger;

      logAgentStep(mockLogger, 2, 'action', 'Retrieving documents', {
        queryCount: 3,
        kb: 'mahabharata',
      });

      expect(mockLogger.debug).toHaveBeenCalledWith('Agent step', {
        step: 2,
        type: 'action',
        content: 'Retrieving documents',
        queryCount: 3,
        kb: 'mahabharata',
      });
    });

    it('should_logWithoutMetadata_when_metadataOmitted', () => {
      const mockLogger = {
        debug: jest.fn(),
      } as unknown as winston.Logger;

      logAgentStep(mockLogger, 3, 'observation', 'Results retrieved');
      expect(mockLogger.debug).toHaveBeenCalledTimes(1);
    });
  });
});

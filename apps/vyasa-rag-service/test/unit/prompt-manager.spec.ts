/**
 * Unit tests for prompt-manager service
 */

const mockS3Send = jest.fn();

jest.mock('@aws-sdk/client-s3', () => ({
  S3Client: jest.fn().mockImplementation(() => ({ send: mockS3Send })),
  GetObjectCommand: jest.fn().mockImplementation((args: unknown) => args),
}));

jest.mock('../../src/lib/logger', () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

// Import after mocks are set up
// We re-import the module fresh for each cache-related test
import {
  getPrompt,
  invalidatePromptCache,
  getSystemPrompt,
  getAgentPrompt,
  getReflectionPrompt,
} from '../../src/services/prompt-manager';

function makeS3Body(content: string) {
  return {
    Body: {
      transformToString: jest.fn().mockResolvedValue(content),
    },
  };
}

describe('PromptManager', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Invalidate cache between tests to avoid cache hits from prior tests
    invalidatePromptCache('vyasa-system');
    invalidatePromptCache('vyasa-agent');
    invalidatePromptCache('vyasa-reflection');
    invalidatePromptCache('test-prompt');
    invalidatePromptCache('test-prompt', 'v1');
    invalidatePromptCache('unknown-prompt');
  });

  describe('getPrompt', () => {
    it('should_fetchFromS3_when_notCached', async () => {
      mockS3Send.mockResolvedValue(makeS3Body('This is the prompt content'));

      const result = await getPrompt('test-prompt');
      expect(result.name).toBe('test-prompt');
      expect(result.content).toBe('This is the prompt content');
      expect(result.version).toBe('unknown');
      expect(mockS3Send).toHaveBeenCalledTimes(1);
    });

    it('should_returnCachedResult_when_calledTwice', async () => {
      mockS3Send.mockResolvedValue(makeS3Body('Cached prompt content'));

      await getPrompt('test-prompt');
      const second = await getPrompt('test-prompt');

      expect(second.content).toBe('Cached prompt content');
      // S3 should only be called once
      expect(mockS3Send).toHaveBeenCalledTimes(1);
    });

    it('should_parseFrontmatter_when_contentHasFrontmatter', async () => {
      const content = `---
version: 2.1
author: system
updated_at: 2026-01-01
description: Test prompt description
---
Actual prompt body here`;

      mockS3Send.mockResolvedValue(makeS3Body(content));

      const result = await getPrompt('test-prompt');
      expect(result.version).toBe('2.1');
      expect(result.metadata.author).toBe('system');
      expect(result.metadata.description).toBe('Test prompt description');
      expect(result.content).toBe('Actual prompt body here');
    });

    it('should_useVersionInPath_when_versionSpecified', async () => {
      mockS3Send.mockResolvedValue(makeS3Body('Versioned content'));

      const result = await getPrompt('test-prompt', 'v1');
      expect(result.version).toBe('v1');
      expect(mockS3Send).toHaveBeenCalled();
    });

    it('should_returnDefaultPrompt_when_s3Throws', async () => {
      mockS3Send.mockRejectedValue(new Error('S3 NoSuchKey'));

      const result = await getPrompt('vyasa-system');
      expect(result.name).toBe('vyasa-system');
      expect(result.version).toBe('default');
      expect(result.content).toContain('Vyasa');
    });

    it('should_returnDefaultPrompt_when_bodyEmpty', async () => {
      mockS3Send.mockResolvedValue({
        Body: { transformToString: jest.fn().mockResolvedValue('') },
      });

      const result = await getPrompt('vyasa-agent');
      expect(result.version).toBe('default');
    });

    it('should_returnDefaultPrompt_when_bodyUndefined', async () => {
      mockS3Send.mockResolvedValue({ Body: undefined });

      const result = await getPrompt('vyasa-reflection');
      expect(result.version).toBe('default');
    });

    it('should_returnGenericDefault_when_unknownPromptName', async () => {
      mockS3Send.mockRejectedValue(new Error('not found'));

      const result = await getPrompt('unknown-prompt');
      expect(result.content).toBe('You are a helpful assistant.');
    });
  });

  describe('invalidatePromptCache', () => {
    it('should_forceFreshFetch_when_cacheInvalidated', async () => {
      mockS3Send.mockResolvedValue(makeS3Body('First fetch'));

      await getPrompt('test-prompt');
      expect(mockS3Send).toHaveBeenCalledTimes(1);

      invalidatePromptCache('test-prompt');

      mockS3Send.mockResolvedValue(makeS3Body('Second fetch'));
      const result = await getPrompt('test-prompt');
      expect(result.content).toBe('Second fetch');
      expect(mockS3Send).toHaveBeenCalledTimes(2);
    });

    it('should_invalidateSpecificVersion_when_versionProvided', async () => {
      mockS3Send.mockResolvedValue(makeS3Body('Versioned'));

      await getPrompt('test-prompt', 'v1');
      invalidatePromptCache('test-prompt', 'v1');

      await getPrompt('test-prompt', 'v1');
      expect(mockS3Send).toHaveBeenCalledTimes(2);
    });
  });

  describe('getSystemPrompt', () => {
    it('should_returnSystemPromptContent_when_called', async () => {
      mockS3Send.mockResolvedValue(makeS3Body('You are Vyasa the sage'));
      const content = await getSystemPrompt();
      expect(content).toBe('You are Vyasa the sage');
    });

    it('should_returnDefaultFallback_when_s3Fails', async () => {
      mockS3Send.mockRejectedValue(new Error('S3 error'));
      const content = await getSystemPrompt();
      expect(content).toContain('Vyasa');
    });
  });

  describe('getAgentPrompt', () => {
    it('should_returnAgentPromptContent_when_called', async () => {
      mockS3Send.mockResolvedValue(makeS3Body('Agent prompt content'));
      const content = await getAgentPrompt();
      expect(content).toBe('Agent prompt content');
    });

    it('should_returnDefaultFallback_when_s3Fails', async () => {
      mockS3Send.mockRejectedValue(new Error('S3 error'));
      const content = await getAgentPrompt();
      expect(content).toContain('Mahabharata');
    });
  });

  describe('getReflectionPrompt', () => {
    it('should_returnReflectionPromptContent_when_called', async () => {
      mockS3Send.mockResolvedValue(makeS3Body('Reflection eval content'));
      const content = await getReflectionPrompt();
      expect(content).toBe('Reflection eval content');
    });

    it('should_returnDefaultFallback_when_s3Fails', async () => {
      mockS3Send.mockRejectedValue(new Error('S3 error'));
      const content = await getReflectionPrompt();
      expect(content).toContain('JSON');
    });
  });
});

/**
 * Unit tests for Reflection service
 */

import {
  checkSufficiency,
  evaluateAnswer,
  quickSufficiencyCheck,
} from '../../src/services/reflection';
import * as bedrockClient from '../../src/services/bedrock-client';

jest.mock('../../src/lib/logger', () => ({
  logger: {
    child: jest.fn(() => ({
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    })),
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

jest.mock('../../src/services/bedrock-client');

const mockGenerate = bedrockClient.generate as jest.MockedFunction<
  typeof bedrockClient.generate
>;

describe('Reflection', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('checkSufficiency', () => {
    it('should return insufficient for empty context', async () => {
      const result = await checkSufficiency('Who was Karna?', '');

      expect(result.sufficient).toBe(false);
      expect(result.confidence).toBe(0);
    });

    it('should check context sufficiency via LLM', async () => {
      mockGenerate.mockResolvedValue({
        text: JSON.stringify({
          sufficient: true,
          confidence: 0.9,
        }),
        tokenUsage: {
          prompt_tokens: 100,
          completion_tokens: 20,
          total_tokens: 120,
        },
      });

      const result = await checkSufficiency(
        'Who was Karna?',
        'Karna was a great warrior and the son of Kunti.'
      );

      expect(result.sufficient).toBe(true);
      expect(result.confidence).toBe(0.9);
      expect(mockGenerate).toHaveBeenCalled();
    });

    it('should identify missing information', async () => {
      mockGenerate.mockResolvedValue({
        text: JSON.stringify({
          sufficient: false,
          missingInfo: 'Date of birth not found',
          confidence: 0.3,
        }),
        tokenUsage: {
          prompt_tokens: 100,
          completion_tokens: 25,
          total_tokens: 125,
        },
      });

      const result = await checkSufficiency(
        'When was Karna born?',
        'Karna was a great warrior.'
      );

      expect(result.sufficient).toBe(false);
      expect(result.missingInfo).toBe('Date of birth not found');
    });

    it('should handle LLM errors gracefully', async () => {
      mockGenerate.mockRejectedValue(new Error('LLM error'));

      const result = await checkSufficiency('Test query', 'Test context');

      expect(result.sufficient).toBe(false);
      expect(result.confidence).toBe(0);
    });
  });

  describe('evaluateAnswer', () => {
    it('should evaluate answer quality', async () => {
      mockGenerate.mockResolvedValue({
        text: JSON.stringify({
          complete: true,
          accurate: true,
          issues: [],
          confidence: 0.95,
        }),
        tokenUsage: {
          prompt_tokens: 100,
          completion_tokens: 30,
          total_tokens: 130,
        },
      });

      const result = await evaluateAnswer(
        'Who was Karna?',
        'Karna was a great warrior and the son of Kunti.',
        'Context about Karna'
      );

      expect(result.complete).toBe(true);
      expect(result.accurate).toBe(true);
      expect(result.confidence).toBe(0.95);
    });

    it('should identify issues in answer', async () => {
      mockGenerate.mockResolvedValue({
        text: JSON.stringify({
          complete: false,
          accurate: false,
          issues: ['Missing birth information', 'No citations'],
          confidence: 0.4,
        }),
        tokenUsage: {
          prompt_tokens: 100,
          completion_tokens: 35,
          total_tokens: 135,
        },
      });

      const result = await evaluateAnswer(
        'Tell me about Karna birth and parents',
        'Karna was a warrior.'
      );

      expect(result.complete).toBe(false);
      expect(result.issues).toHaveLength(2);
    });
  });

  describe('quickSufficiencyCheck', () => {
    it('should return insufficient for empty results', () => {
      const result = quickSufficiencyCheck('Query', '', 0);

      expect(result.sufficient).toBe(false);
      expect(result.confidence).toBe(0);
    });

    it('should return insufficient for short context', () => {
      const result = quickSufficiencyCheck('Query', 'Short text', 1);

      expect(result.sufficient).toBe(false);
      expect(result.confidence).toBe(0.2);
    });

    it('should return sufficient when query terms match', () => {
      const query = 'Who was Karna and what was his role';
      const context =
        'Karna was a great warrior in the Mahabharata. He played a major role in the Kurukshetra war.';

      const result = quickSufficiencyCheck(query, context, 3);

      expect(result.sufficient).toBe(true);
      expect(result.confidence).toBeGreaterThan(0.7);
    });

    it('should return insufficient when query terms missing', () => {
      const query = 'Tell me about Krishna';
      const context =
        'Arjuna was a great archer. He was very skilled with the bow.';

      const result = quickSufficiencyCheck(query, context, 3);

      expect(result.sufficient).toBe(false);
      expect(result.confidence).toBeLessThan(0.5);
    });
  });
});

/**
 * Unit tests for Query Planner
 */

import {
  decomposeQuery,
  reformulateQuery,
} from '../../src/services/query-planner';
import * as bedrockClient from '../../src/services/bedrock-client';

jest.mock('../../src/services/bedrock-client');

const mockGenerate = bedrockClient.generate as jest.MockedFunction<
  typeof bedrockClient.generate
>;

describe('QueryPlanner', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('decomposeQuery', () => {
    it('should identify simple queries without decomposition', async () => {
      const simpleQueries = [
        'Who is Karna?',
        'What is the Mahabharata?',
        'Tell me about Arjuna',
        'Describe the Kurukshetra war',
      ];

      for (const query of simpleQueries) {
        const result = await decomposeQuery(query);
        expect(result.needsDecomposition).toBe(false);
        expect(result.subQueries).toHaveLength(1);
        expect(result.subQueries[0]).toBe(query);
      }

      // Should not call LLM for simple queries
      expect(mockGenerate).not.toHaveBeenCalled();
    });

    it('should identify complex queries needing decomposition', async () => {
      // These patterns should be detected as complex
      const complexQueries = [
        'Who were the parents of Karna foster father?',
        'What happened to Arjuna son after the war?',
        'Tell me about the relationship between Krishna and Arjuna',
      ];

      // Mock LLM response for complex decomposition
      mockGenerate.mockResolvedValue({
        text: JSON.stringify({
          needsDecomposition: true,
          subQueries: ['sub1', 'sub2'],
          reasoning: 'Multi-hop',
        }),
        tokenUsage: {
          prompt_tokens: 100,
          completion_tokens: 50,
          total_tokens: 150,
        },
      });

      for (const query of complexQueries) {
        jest.clearAllMocks();
        const result = await decomposeQuery(query);

        // Complex queries should trigger LLM analysis
        expect(mockGenerate).toHaveBeenCalled();
      }
    });

    it('should use LLM for decomposition when pattern detection is ambiguous', async () => {
      mockGenerate.mockResolvedValue({
        text: JSON.stringify({
          needsDecomposition: true,
          subQueries: ['Karna identity', 'Karna parents'],
          reasoning: 'Requires multiple facts',
        }),
        tokenUsage: {
          prompt_tokens: 100,
          completion_tokens: 50,
          total_tokens: 150,
        },
      });

      const result = await decomposeQuery('Tell me about Karna and his family');

      expect(result.needsDecomposition).toBe(true);
      expect(result.subQueries).toHaveLength(2);
    });

    it('should handle LLM errors gracefully', async () => {
      mockGenerate.mockRejectedValue(new Error('LLM error'));

      const query = 'Complex question about Mahabharata';
      const result = await decomposeQuery(query);

      // Should fall back to original query
      expect(result.needsDecomposition).toBe(false);
      expect(result.subQueries).toEqual([query]);
      expect(result.reasoning).toContain('Analysis failed');
    });

    it('should handle invalid LLM responses', async () => {
      mockGenerate.mockResolvedValue({
        text: 'Not valid JSON',
        tokenUsage: {
          prompt_tokens: 100,
          completion_tokens: 20,
          total_tokens: 120,
        },
      });

      const query = 'Test query';
      const result = await decomposeQuery(query);

      expect(result.needsDecomposition).toBe(false);
      expect(result.subQueries).toEqual([query]);
    });
  });

  describe('reformulateQuery', () => {
    it('should reformulate query based on missing information', async () => {
      mockGenerate.mockResolvedValue({
        text: 'Karna birth parents lineage',
        tokenUsage: {
          prompt_tokens: 50,
          completion_tokens: 10,
          total_tokens: 60,
        },
      });

      const originalQuery = 'Who were Karna parents?';
      const missingInfo = 'Birth parents not foster parents';
      const previousResults = ['Karna was raised by Adhiratha'];

      const result = await reformulateQuery(
        originalQuery,
        previousResults,
        missingInfo
      );

      expect(result).toBe('Karna birth parents lineage');
      expect(mockGenerate).toHaveBeenCalled();
    });

    it('should return original query on error', async () => {
      mockGenerate.mockRejectedValue(new Error('LLM error'));

      const originalQuery = 'Test query';
      const result = await reformulateQuery(originalQuery, [], 'missing info');

      expect(result).toBe(originalQuery);
    });
  });
});

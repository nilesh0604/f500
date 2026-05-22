/**
 * Unit tests for ReAct Agent
 */

import { runAgent, buildChatResponse } from '../../src/services/agent';
import { AgentResult, Message } from '../../src/types';

// Mock dependencies
jest.mock('../../src/services/bedrock-client');
jest.mock('../../src/services/query-planner');
jest.mock('../../src/services/reflection');
jest.mock('../../src/services/prompt-manager');
jest.mock('../../src/lib/logger', () => ({
  logger: {
    child: jest.fn(() => ({
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    })),
  },
  logAgentStep: jest.fn(),
}));

import * as bedrockClient from '../../src/services/bedrock-client';
import * as queryPlanner from '../../src/services/query-planner';
import * as reflection from '../../src/services/reflection';
import * as promptManager from '../../src/services/prompt-manager';

const mockRetrieve = bedrockClient.retrieve as jest.MockedFunction<
  typeof bedrockClient.retrieve
>;
const mockGenerate = bedrockClient.generate as jest.MockedFunction<
  typeof bedrockClient.generate
>;
const mockDecomposeQuery = queryPlanner.decomposeQuery as jest.MockedFunction<
  typeof queryPlanner.decomposeQuery
>;
const mockCheckSufficiency = reflection.checkSufficiency as jest.MockedFunction<
  typeof reflection.checkSufficiency
>;
const mockGetSystemPrompt =
  promptManager.getSystemPrompt as jest.MockedFunction<
    typeof promptManager.getSystemPrompt
  >;
const mockGetAgentPrompt = promptManager.getAgentPrompt as jest.MockedFunction<
  typeof promptManager.getAgentPrompt
>;

describe('Agent', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    // Default mocks
    mockDecomposeQuery.mockResolvedValue({
      needsDecomposition: false,
      subQueries: ['Karna identity'],
      reasoning: 'Simple query',
    });

    mockRetrieve.mockResolvedValue([
      {
        content: 'Karna was a great warrior',
        metadata: { source: 'test.txt', book: 'Adi Parva' },
        score: 0.9,
      },
    ]);

    mockCheckSufficiency.mockResolvedValue({
      sufficient: true,
      confidence: 0.9,
    });

    mockGetSystemPrompt.mockResolvedValue('You are Vyasa, the sage');
    mockGetAgentPrompt.mockResolvedValue('Answer based on context');

    mockGenerate.mockResolvedValue({
      text: 'Karna was a great warrior and a central character.',
      tokenUsage: {
        prompt_tokens: 100,
        completion_tokens: 50,
        total_tokens: 150,
      },
    });
  });

  describe('runAgent', () => {
    it('should execute ReAct loop for simple query', async () => {
      const query = 'Who was Karna?';
      const sessionMessages: Message[] = [];

      const result = await runAgent(
        query,
        sessionMessages,
        'test-correlation-id'
      );

      expect(result).toBeDefined();
      expect(result.answer).toBeDefined();
      expect(result.citations).toBeDefined();
      expect(result.tokenUsage).toBeDefined();
      expect(result.trace).toBeDefined();
      expect(result.iterations).toBeGreaterThan(0);

      // Verify flow
      expect(mockDecomposeQuery).toHaveBeenCalledWith(query);
      expect(mockRetrieve).toHaveBeenCalled();
      expect(mockCheckSufficiency).toHaveBeenCalled();
      expect(mockGenerate).toHaveBeenCalled();
    });

    it('should handle multi-hop query decomposition', async () => {
      mockDecomposeQuery.mockResolvedValue({
        needsDecomposition: true,
        subQueries: ['Karna identity', 'Karna foster father'],
        reasoning: 'Multi-hop question',
      });

      // First retrieval - Karna identity
      mockRetrieve
        .mockResolvedValueOnce([
          {
            content: 'Karna was raised by Adhiratha',
            metadata: { source: 'test1.txt', book: 'Adi Parva' },
            score: 0.9,
          },
        ])
        // Second retrieval - Adhiratha parents
        .mockResolvedValueOnce([
          {
            content: 'Adhiratha was a charioteer',
            metadata: { source: 'test2.txt', book: 'Adi Parva' },
            score: 0.85,
          },
        ]);

      const query = 'Who were the parents of Karna foster father?';
      const result = await runAgent(query, [], 'test-correlation-id');

      expect(result.iterations).toBe(2);
      expect(mockRetrieve).toHaveBeenCalledTimes(2);
    });

    it('should stop after max iterations', async () => {
      mockDecomposeQuery.mockResolvedValue({
        needsDecomposition: true,
        subQueries: ['query1', 'query2', 'query3', 'query4'],
        reasoning: 'Complex query',
      });

      mockCheckSufficiency.mockResolvedValue({
        sufficient: false,
        confidence: 0.5,
        missingInfo: 'Need more context',
      });

      const query = 'Complex multi-part question';
      const result = await runAgent(query, [], 'test-correlation-id');

      // Should stop at max iterations (3)
      expect(result.iterations).toBeLessThanOrEqual(3);
    });

    it('should include agent trace with all steps', async () => {
      const query = 'Who was Karna?';
      const result = await runAgent(query, [], 'test-correlation-id');

      expect(result.trace.length).toBeGreaterThan(0);

      // Should have thought step
      expect(result.trace.some(s => s.type === 'thought')).toBe(true);

      // Should have action steps
      expect(result.trace.some(s => s.type === 'action')).toBe(true);

      // Should have observation step
      expect(result.trace.some(s => s.type === 'observation')).toBe(true);

      // Should have reflection step
      expect(result.trace.some(s => s.type === 'reflection')).toBe(true);
    });

    it('should track token usage across operations', async () => {
      mockGenerate.mockResolvedValue({
        text: 'Answer',
        tokenUsage: {
          prompt_tokens: 200,
          completion_tokens: 100,
          total_tokens: 300,
        },
      });

      const result = await runAgent('Test query', [], 'test-correlation-id');

      expect(result.tokenUsage.total_tokens).toBeGreaterThan(0);
    });
  });

  describe('buildChatResponse', () => {
    it('should build response from agent result', () => {
      const sessionId = 'test-session-id';
      const agentResult: AgentResult = {
        answer: 'Karna was a great warrior.',
        citations: [
          {
            title: 'Mahabharata - Adi Parva',
            book: 'Adi Parva',
            score: 0.9,
          },
        ],
        tokenUsage: {
          prompt_tokens: 100,
          completion_tokens: 50,
          total_tokens: 150,
        },
        trace: [
          {
            step: 1,
            type: 'thought',
            content: 'Analyzing query',
            timestamp: new Date().toISOString(),
          },
        ],
        iterations: 1,
      };

      const response = buildChatResponse(sessionId, agentResult);

      expect(response.session_id).toBe(sessionId);
      expect(response.response).toBe(agentResult.answer);
      expect(response.citations).toEqual(agentResult.citations);
      expect(response.token_usage).toEqual(agentResult.tokenUsage);
      expect(response.agent_trace).toEqual(agentResult.trace);
    });
  });
});

/**
 * Unit tests for Bedrock client service
 */

// Mock AWS SDK clients
const mockAgentRuntimeSend = jest.fn();
const mockRuntimeSend = jest.fn();

jest.mock('@aws-sdk/client-bedrock-agent-runtime', () => ({
  BedrockAgentRuntimeClient: jest.fn().mockImplementation(() => ({
    send: mockAgentRuntimeSend,
  })),
  RetrieveCommand: jest
    .fn()
    .mockImplementation((args: unknown) => ({ _args: args })),
  RetrieveAndGenerateCommand: jest
    .fn()
    .mockImplementation((args: unknown) => ({ _args: args })),
}));

jest.mock('@aws-sdk/client-bedrock-runtime', () => ({
  BedrockRuntimeClient: jest.fn().mockImplementation(() => ({
    send: mockRuntimeSend,
  })),
  ConverseCommand: jest
    .fn()
    .mockImplementation((args: unknown) => ({ _args: args })),
  ConverseStreamCommand: jest
    .fn()
    .mockImplementation((args: unknown) => ({ _args: args })),
}));

// Mock tracer - pass through to fn directly
jest.mock('../../src/lib/tracer', () => ({
  traceFunction: jest
    .fn()
    .mockImplementation((_name: string, fn: () => Promise<unknown>) => fn()),
}));

// Mock circuit breaker - pass through to fn directly
jest.mock('../../src/lib/circuit-breaker', () => ({
  bedrockCircuitBreaker: {
    execute: jest.fn().mockImplementation((fn: () => Promise<unknown>) => fn()),
  },
  dynamodbCircuitBreaker: {
    execute: jest.fn().mockImplementation((fn: () => Promise<unknown>) => fn()),
  },
}));

jest.mock('../../src/lib/logger', () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

import {
  retrieve,
  retrieveAndGenerate,
  generate,
  generateStream,
} from '../../src/services/bedrock-client';

describe('BedrockClient', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('retrieve', () => {
    it('should_returnRetrievalResults_when_kbReturnsResults', async () => {
      mockAgentRuntimeSend.mockResolvedValue({
        retrievalResults: [
          {
            content: { text: 'Karna was a warrior' },
            metadata: {
              'x-amz-bedrock-kb-source-uri': 's3://bucket/karna.txt',
              book: 'Adi Parva',
              chapter: '1',
              verse: '5',
              page: '10',
            },
            score: 0.95,
          },
        ],
      });

      const results = await retrieve('Who was Karna?');
      expect(results).toHaveLength(1);
      expect(results[0].content).toBe('Karna was a warrior');
      expect(results[0].score).toBe(0.95);
      expect(results[0].metadata.source).toBe('s3://bucket/karna.txt');
      expect(results[0].metadata.book).toBe('Adi Parva');
      expect(results[0].metadata.page).toBe(10);
    });

    it('should_returnEmptyArray_when_noResults', async () => {
      mockAgentRuntimeSend.mockResolvedValue({ retrievalResults: [] });
      const results = await retrieve('unknown query');
      expect(results).toEqual([]);
    });

    it('should_returnEmptyArray_when_retrievalResultsUndefined', async () => {
      mockAgentRuntimeSend.mockResolvedValue({});
      const results = await retrieve('test');
      expect(results).toEqual([]);
    });

    it('should_useDefaultValues_when_metadataMissing', async () => {
      mockAgentRuntimeSend.mockResolvedValue({
        retrievalResults: [
          {
            content: { text: 'content' },
            metadata: {},
            score: undefined,
          },
        ],
      });

      const results = await retrieve('test query');
      expect(results[0].score).toBe(0);
      expect(results[0].metadata.source).toBe('unknown');
      expect(results[0].metadata.book).toBe('');
      expect(results[0].metadata.page).toBeUndefined();
    });

    it('should_propagateError_when_kbThrows', async () => {
      mockAgentRuntimeSend.mockRejectedValue(new Error('KB unavailable'));
      await expect(retrieve('test')).rejects.toThrow('KB unavailable');
    });
  });

  describe('retrieveAndGenerate', () => {
    it('should_returnRAGResult_when_successful', async () => {
      mockAgentRuntimeSend.mockResolvedValue({
        output: { text: 'Karna was born to Kunti.' },
        citations: [
          {
            retrievedReferences: [
              {
                content: { text: 'Source text about Karna birth' },
                metadata: { book: 'Adi Parva', chapter: '3' },
              },
            ],
          },
        ],
        usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
      });

      const result = await retrieveAndGenerate('Who is Karna?');
      expect(result.answer).toBe('Karna was born to Kunti.');
      expect(result.citations).toHaveLength(1);
      expect(result.citations[0].book).toBe('Adi Parva');
    });

    it('should_passSessionId_when_provided', async () => {
      mockAgentRuntimeSend.mockResolvedValue({
        output: { text: 'Answer' },
        citations: [],
      });

      const result = await retrieveAndGenerate('query', 'session-123');
      expect(result.answer).toBe('Answer');
      expect(mockAgentRuntimeSend).toHaveBeenCalled();
    });

    it('should_handleEmptyCitations_when_noCitationsReturned', async () => {
      mockAgentRuntimeSend.mockResolvedValue({
        output: { text: 'Answer' },
        citations: undefined,
      });

      const result = await retrieveAndGenerate('query');
      expect(result.citations).toEqual([]);
    });

    it('should_handleMissingTokenUsage_when_usageUndefined', async () => {
      mockAgentRuntimeSend.mockResolvedValue({
        output: { text: 'Answer' },
        citations: [],
        usage: undefined,
      });

      const result = await retrieveAndGenerate('query');
      expect(result.tokenUsage.prompt_tokens).toBe(0);
      expect(result.tokenUsage.completion_tokens).toBe(0);
      expect(result.tokenUsage.total_tokens).toBe(0);
    });

    it('should_handleCitationWithNullMetadata_when_metadataNull', async () => {
      mockAgentRuntimeSend.mockResolvedValue({
        output: { text: 'Answer' },
        citations: [
          {
            retrievedReferences: [
              {
                content: { text: 'Source content text is here' },
                metadata: {},
              },
            ],
          },
        ],
      });

      const result = await retrieveAndGenerate('query');
      expect(result.citations[0].book).toBeUndefined();
      expect(result.citations[0].chapter).toBeUndefined();
    });
  });

  describe('generate', () => {
    it('should_returnTextAndTokenUsage_when_successful', async () => {
      mockRuntimeSend.mockResolvedValue({
        output: {
          message: {
            content: [{ text: 'Karna was a great hero.' }],
          },
        },
        usage: { inputTokens: 200, outputTokens: 80 },
      });

      const result = await generate('Tell me about Karna');
      expect(result.text).toBe('Karna was a great hero.');
      expect(result.tokenUsage.prompt_tokens).toBe(200);
      expect(result.tokenUsage.completion_tokens).toBe(80);
      expect(result.tokenUsage.total_tokens).toBe(280);
    });

    it('should_passSystemPrompt_when_provided', async () => {
      mockRuntimeSend.mockResolvedValue({
        output: { message: { content: [{ text: 'Answer' }] } },
        usage: { inputTokens: 100, outputTokens: 30 },
      });

      const result = await generate('Question', 'You are a helpful sage');
      expect(result.text).toBe('Answer');
      expect(mockRuntimeSend).toHaveBeenCalled();
    });

    it('should_returnEmptyText_when_noOutputContent', async () => {
      mockRuntimeSend.mockResolvedValue({
        output: { message: { content: [] } },
        usage: { inputTokens: 0, outputTokens: 0 },
      });

      const result = await generate('empty');
      expect(result.text).toBe('');
    });

    it('should_returnEmptyText_when_outputUndefined', async () => {
      mockRuntimeSend.mockResolvedValue({
        output: undefined,
        usage: { inputTokens: 0, outputTokens: 0 },
      });

      const result = await generate('test');
      expect(result.text).toBe('');
    });

    it('should_handleZeroTokens_when_usageUndefined', async () => {
      mockRuntimeSend.mockResolvedValue({
        output: { message: { content: [{ text: 'ok' }] } },
        usage: undefined,
      });

      const result = await generate('test');
      expect(result.tokenUsage.prompt_tokens).toBe(0);
      expect(result.tokenUsage.total_tokens).toBe(0);
    });
  });

  describe('generateStream', () => {
    it('should_yieldTextChunks_when_streamHasContent', async () => {
      const mockStream = (async function* () {
        yield { contentBlockDelta: { delta: { text: 'Hello' } } };
        yield { contentBlockDelta: { delta: { text: ' World' } } };
        yield { metadata: { usage: { inputTokens: 50, outputTokens: 20 } } };
      })();

      mockRuntimeSend.mockResolvedValue({ stream: mockStream });

      const gen = generateStream('test prompt');
      const chunks: string[] = [];

      let next = await gen.next();
      while (!next.done) {
        chunks.push(next.value as string);
        next = await gen.next();
      }

      expect(chunks).toEqual(['Hello', ' World']);
      const finalValue = next.value as {
        tokenUsage: {
          prompt_tokens: number;
          completion_tokens: number;
          total_tokens: number;
        };
      };
      expect(finalValue.tokenUsage.prompt_tokens).toBe(50);
      expect(finalValue.tokenUsage.completion_tokens).toBe(20);
      expect(finalValue.tokenUsage.total_tokens).toBe(70);
    });

    it('should_returnZeroTokens_when_streamIsEmpty', async () => {
      const mockStream = (async function* () {
        // empty stream
      })();

      mockRuntimeSend.mockResolvedValue({ stream: mockStream });

      const gen = generateStream('empty');
      let next = await gen.next();
      while (!next.done) {
        next = await gen.next();
      }

      const finalValue = next.value as { tokenUsage: { total_tokens: number } };
      expect(finalValue.tokenUsage.total_tokens).toBe(0);
    });

    it('should_skipNonTextDeltas_when_deltaHasNoText', async () => {
      const mockStream = (async function* () {
        yield { contentBlockDelta: { delta: {} } }; // no text
        yield { contentBlockDelta: { delta: { text: 'Real content' } } };
      })();

      mockRuntimeSend.mockResolvedValue({ stream: mockStream });

      const gen = generateStream('test');
      const chunks: string[] = [];
      let next = await gen.next();
      while (!next.done) {
        chunks.push(next.value as string);
        next = await gen.next();
      }
      expect(chunks).toEqual(['Real content']);
    });

    it('should_returnZeroTokens_when_noStream', async () => {
      mockRuntimeSend.mockResolvedValue({ stream: undefined });

      const gen = generateStream('test');
      let next = await gen.next();
      while (!next.done) {
        next = await gen.next();
      }
      const finalValue = next.value as { tokenUsage: { total_tokens: number } };
      expect(finalValue.tokenUsage.total_tokens).toBe(0);
    });

    it('should_passSystemPrompt_when_provided', async () => {
      const mockStream = (async function* () {
        yield { contentBlockDelta: { delta: { text: 'ok' } } };
      })();
      mockRuntimeSend.mockResolvedValue({ stream: mockStream });

      const gen = generateStream('prompt', 'system-prompt');
      let next = await gen.next();
      while (!next.done) {
        next = await gen.next();
      }
      expect(mockRuntimeSend).toHaveBeenCalled();
    });
  });
});

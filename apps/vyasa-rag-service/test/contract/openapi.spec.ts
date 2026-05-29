/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Contract tests for OpenAPI spec compliance
 * Validates that responses match the API schema
 */

jest.mock('../../src/lib/logger', () => ({
  logger: {
    child: jest.fn().mockReturnValue({
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    }),
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
  createRequestLogger: jest.fn().mockReturnValue({
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  }),
  logAgentStep: jest.fn(),
}));

jest.mock('../../src/lib/rate-limiter', () => ({
  checkRateLimit: jest.fn().mockResolvedValue({ allowed: true, remaining: 99 }),
  checkGlobalRateLimit: jest
    .fn()
    .mockResolvedValue({ allowed: true, remaining: 99 }),
  getDefaultRateLimits: jest
    .fn()
    .mockReturnValue({ perMinute: 10, perHour: 100, global: 100 }),
}));

jest.mock('../../src/services/session-store', () => ({
  getOrCreateSession: jest.fn().mockResolvedValue({
    session_id: '550e8400-e29b-41d4-a716-446655440000',
    messages: [],
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ttl: Math.floor(Date.now() / 1000) + 604800,
  }),
  getSessionMessages: jest.fn().mockResolvedValue([]),
  addMessageToSession: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../src/services/agent', () => ({
  runAgent: jest.fn().mockResolvedValue({
    answer: 'Karna was a great warrior and son of Kunti.',
    citations: [
      { title: 'Mahabharata - Adi Parva', book: 'Adi Parva', score: 0.9 },
    ],
    tokenUsage: {
      prompt_tokens: 100,
      completion_tokens: 50,
      total_tokens: 150,
    },
    trace: [],
    iterations: 1,
  }),
  buildChatResponse: jest.fn(
    (
      sessionId: string,
      result: {
        answer: string;
        citations: unknown[];
        tokenUsage: unknown;
        trace: unknown[];
      }
    ) => ({
      session_id: sessionId,
      response: result.answer,
      citations: result.citations,
      token_usage: result.tokenUsage,
      agent_trace: result.trace,
    })
  ),
}));

jest.mock('../../src/services/bedrock-client', () => ({
  retrieve: jest.fn().mockResolvedValue([
    {
      content: 'Karna was a great warrior in the Mahabharata epic poem.',
      metadata: { source: 's3://bucket/adi-parva.txt', book: 'Adi Parva' },
      score: 0.9,
    },
  ]),
  generate: jest.fn().mockResolvedValue({
    text: 'Karna was a great warrior.',
    tokenUsage: {
      prompt_tokens: 100,
      completion_tokens: 50,
      total_tokens: 150,
    },
  }),
}));

jest.mock('../../src/services/query-planner', () => ({
  decomposeQuery: jest.fn().mockResolvedValue({
    needsDecomposition: false,
    subQueries: ['Karna'],
    reasoning: 'Simple query',
  }),
}));

jest.mock('../../src/services/reflection', () => ({
  checkSufficiency: jest
    .fn()
    .mockResolvedValue({ sufficient: true, confidence: 0.9 }),
}));

jest.mock('../../src/services/prompt-manager', () => ({
  getSystemPrompt: jest.fn().mockResolvedValue('You are a wise sage.'),
  getAgentPrompt: jest.fn().mockResolvedValue('Answer the question.'),
}));

import { handler } from '../../src/index';
import type { LambdaResponse } from '../../src/types';

describe('OpenAPI Contract Tests', () => {
  const createEvent = (
    path: string,
    method: string,
    body?: Record<string, unknown>
  ) => ({
    rawPath: path,
    requestContext: {
      requestId: 'test-request-id',
      http: { method, sourceIp: '127.0.0.1' },
    },
    body: body ? JSON.stringify(body) : undefined,
    headers: {},
  });

  describe('POST /chat response format', () => {
    it('should return response matching ChatResponse schema', async () => {
      const event = createEvent('/chat', 'POST', {
        message: 'Who was Karna?',
      });

      const response = (await handler(
        event as any,
        {} as any
      )) as LambdaResponse;
      expect(response.statusCode).toBe(200);

      const body = JSON.parse(response.body);

      // Required fields per OpenAPI spec
      expect(body).toHaveProperty('session_id');
      expect(body).toHaveProperty('response');
      expect(body).toHaveProperty('citations');

      // session_id should be UUID format
      expect(body.session_id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
      );

      // response should be string
      expect(typeof body.response).toBe('string');

      // citations should be array
      expect(Array.isArray(body.citations)).toBe(true);

      // Each citation should have required title
      for (const citation of body.citations) {
        expect(citation).toHaveProperty('title');
        expect(typeof citation.title).toBe('string');

        // Optional fields should have correct types if present
        if (citation.book !== undefined) {
          expect(typeof citation.book).toBe('string');
        }
        if (citation.chapter !== undefined) {
          expect(typeof citation.chapter).toBe('string');
        }
        if (citation.score !== undefined) {
          expect(typeof citation.score).toBe('number');
          expect(citation.score).toBeGreaterThanOrEqual(0);
          expect(citation.score).toBeLessThanOrEqual(1);
        }
      }

      // token_usage is optional but should have correct format if present
      if (body.token_usage) {
        expect(typeof body.token_usage.prompt_tokens).toBe('number');
        expect(typeof body.token_usage.completion_tokens).toBe('number');
        expect(typeof body.token_usage.total_tokens).toBe('number');
      }
    });
  });

  describe('Error response formats', () => {
    it('should return 422 for invalid input', async () => {
      const event = createEvent('/chat', 'POST', {});

      const response = (await handler(
        event as any,
        {} as any
      )) as LambdaResponse;
      expect(response.statusCode).toBe(422);

      const body = JSON.parse(response.body);
      expect(body.error).toBe('ValidationError');
      expect(body.message).toBeDefined();
    });

    it('should return 404 for unknown paths', async () => {
      const event = createEvent('/unknown', 'GET');

      const response = (await handler(
        event as any,
        {} as any
      )) as LambdaResponse;
      expect(response.statusCode).toBe(404);

      const body = JSON.parse(response.body);
      expect(body.error).toBe('NotFound');
    });
  });

  describe('GET /health response format', () => {
    it('should return response matching HealthResponse schema', async () => {
      const event = createEvent('/health', 'GET');

      const response = (await handler(
        event as any,
        {} as any
      )) as LambdaResponse;
      expect(response.statusCode).toBe(200);

      const body = JSON.parse(response.body);

      // Required fields
      expect(body).toHaveProperty('status');
      expect(body).toHaveProperty('version');
      expect(body).toHaveProperty('timestamp');

      // status should be enum value
      expect(['healthy', 'unhealthy', 'degraded']).toContain(body.status);

      // version should be string
      expect(typeof body.version).toBe('string');

      // timestamp should be ISO 8601 format
      expect(body.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    });
  });

  describe('POST /chat/stream response format', () => {
    it('should return SSE format', async () => {
      const event = createEvent('/chat/stream', 'POST', {
        message: 'Who was Karna?',
      });

      const response = (await handler(
        event as any,
        {} as any
      )) as LambdaResponse;
      expect(response.statusCode).toBe(200);

      // Content-Type should be text/event-stream
      expect(response.headers).toHaveProperty('Content-Type');
      expect(response.headers['Content-Type']).toBe('text/event-stream');

      // Body should contain SSE events
      const body = response.body;
      expect(body).toContain('event:');
      expect(body).toContain('data:');
    });
  });
});

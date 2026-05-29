/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Integration tests for chat handler
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
    answer: 'Karna was a great warrior.',
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

import { handler } from '../../src/handlers/chat';
import { mockChatRequests } from '../fixtures/test-documents';
import type { LambdaResponse } from '../../src/types';

describe('POST /chat Integration', () => {
  const createEvent = (body: Record<string, unknown>) => ({
    rawPath: '/chat',
    requestContext: {
      requestId: 'test-request-id',
      http: { method: 'POST', sourceIp: '127.0.0.1' },
    },
    body: JSON.stringify(body),
    headers: {},
  });

  it('should create new session when session_id not provided', async () => {
    const event = createEvent(mockChatRequests.newSession);

    const response = (await handler(event as any)) as LambdaResponse;

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.session_id).toBeDefined();
    expect(body.response).toBeDefined();
    expect(body.citations).toBeDefined();
  });

  it('should return 422 for invalid input', async () => {
    const event = createEvent({});

    const response = (await handler(event as any)) as LambdaResponse;

    expect(response.statusCode).toBe(422);
    const body = JSON.parse(response.body);
    expect(body.error).toBe('ValidationError');
  });

  it('should return 422 for empty message', async () => {
    const event = createEvent({ message: '' });

    const response = (await handler(event as any)) as LambdaResponse;

    expect(response.statusCode).toBe(422);
  });

  it('should return 422 for invalid session_id', async () => {
    const event = createEvent({
      session_id: 'not-a-uuid',
      message: 'Test',
    });

    const response = (await handler(event as any)) as LambdaResponse;

    expect(response.statusCode).toBe(422);
  });
});

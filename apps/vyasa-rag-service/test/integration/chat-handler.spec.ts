/**
 * Integration tests for chat handler
 */

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

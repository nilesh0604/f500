/**
 * Contract tests for OpenAPI spec compliance
 * Validates that responses match the API schema
 */

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

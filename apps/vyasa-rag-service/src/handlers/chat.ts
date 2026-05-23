/**
 * Chat handler (non-streaming)
 * POST /chat
 */

import { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { v4 as uuidv4 } from 'uuid';
import { ChatResponse, LambdaResponse } from '../types';
import { safeValidateChatRequest } from '../lib/validators';
import {
  checkRateLimit,
  checkGlobalRateLimit,
  getDefaultRateLimits,
} from '../lib/rate-limiter';
import {
  getOrCreateSession,
  addMessageToSession,
  getSessionMessages,
} from '../services/session-store';
import { runAgent, buildChatResponse } from '../services/agent';
import { createRequestLogger } from '../lib/logger';

export async function handler(
  event: APIGatewayProxyEventV2
): Promise<APIGatewayProxyResultV2> {
  const correlationId = event.requestContext?.requestId || uuidv4();
  const requestLogger = createRequestLogger(correlationId);

  try {
    // Parse and validate input
    const body = event.body ? JSON.parse(event.body) : {};
    const validation = safeValidateChatRequest(body);

    if (!validation.success) {
      requestLogger.warn('Validation failed', { error: validation.error });
      return createErrorResponse(
        422,
        'ValidationError',
        validation.error || 'Invalid input'
      );
    }

    const chatRequest = validation.data!;
    requestLogger.info('Chat request received', {
      sessionId: chatRequest.session_id,
      messageLength: chatRequest.message.length,
    });

    // Rate limiting
    const clientIp = event.requestContext?.http?.sourceIp || 'unknown';
    const rateLimits = getDefaultRateLimits();

    const globalCheck = await checkGlobalRateLimit(rateLimits.global);
    if (!globalCheck.allowed) {
      return createErrorResponse(
        429,
        'RateLimitExceeded',
        'Global rate limit exceeded',
        globalCheck.retry_after
      );
    }

    const clientCheck = await checkRateLimit(clientIp, {
      perMinute: rateLimits.perMinute,
      perHour: rateLimits.perHour,
    });
    if (!clientCheck.allowed) {
      return createErrorResponse(
        429,
        'RateLimitExceeded',
        'Rate limit exceeded',
        clientCheck.retry_after
      );
    }

    // Get or create session
    const session = await getOrCreateSession(chatRequest.session_id);
    const sessionMessages = await getSessionMessages(session.session_id);

    // Run agent
    const agentResult = await runAgent(
      chatRequest.message,
      sessionMessages,
      correlationId
    );

    // Update session with messages
    await addMessageToSession(session.session_id, {
      role: 'user',
      content: chatRequest.message,
      timestamp: new Date().toISOString(),
    });

    await addMessageToSession(
      session.session_id,
      {
        role: 'assistant',
        content: agentResult.answer,
        timestamp: new Date().toISOString(),
        citations: agentResult.citations,
      },
      agentResult.trace
    );

    // Build response
    const response: ChatResponse = buildChatResponse(
      session.session_id,
      agentResult
    );

    requestLogger.info('Chat response sent', {
      sessionId: session.session_id,
      responseLength: agentResult.answer.length,
      citations: agentResult.citations.length,
      iterations: agentResult.iterations,
    });

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'X-Request-ID': correlationId,
      },
      body: JSON.stringify(response),
    };
  } catch (error) {
    requestLogger.error('Chat handler error', { error });

    // Check if it's a Bedrock/circuit breaker error
    if (error instanceof Error && error.message.includes('Circuit breaker')) {
      return createErrorResponse(503, 'ServiceUnavailable', error.message);
    }

    return createErrorResponse(
      500,
      'InternalError',
      'An unexpected error occurred'
    );
  }
}

function createErrorResponse(
  statusCode: number,
  code: string,
  message: string,
  retryAfter?: number
): LambdaResponse {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (retryAfter !== undefined) {
    headers['Retry-After'] = retryAfter.toString();
  }

  return {
    statusCode,
    headers,
    body: JSON.stringify({
      error: code,
      message,
      ...(retryAfter !== undefined && { retry_after: retryAfter }),
    }),
  };
}

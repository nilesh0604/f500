/**
 * Streaming chat handler
 * POST /chat/stream
 * Returns Server-Sent Events (SSE)
 */

import { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { v4 as uuidv4 } from 'uuid';
import { StreamEvent } from '../types';
import { safeValidateChatRequest } from '../lib/validators';
import {
  checkRateLimit,
  checkGlobalRateLimit,
  getDefaultRateLimits,
} from '../lib/rate-limiter';
import { getOrCreateSession } from '../services/session-store';
import { retrieve } from '../services/bedrock-client';
import { assembleContext } from '../services/context-assembler';
import { extractCitations } from '../services/citation-extractor';
import { decomposeQuery } from '../services/query-planner';
import { checkSufficiency } from '../services/reflection';
import { getSystemPrompt } from '../services/prompt-manager';
import { createRequestLogger } from '../lib/logger';
import { generate } from '../services/bedrock-client';

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
      return createErrorResponse(
        422,
        'ValidationError',
        validation.error || 'Invalid input'
      );
    }

    const chatRequest = validation.data!;

    // Rate limiting
    const clientIp = event.requestContext?.http?.sourceIp || 'unknown';
    const rateLimits = getDefaultRateLimits();

    const globalCheck = await checkGlobalRateLimit(rateLimits.global);
    if (!globalCheck.allowed) {
      return createErrorResponse(
        429,
        'RateLimitExceeded',
        'Global rate limit exceeded'
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
        'Rate limit exceeded'
      );
    }

    // Get or create session
    const session = await getOrCreateSession(chatRequest.session_id);

    // For Lambda streaming, we need to use the ResponseStream API
    // This is a simplified version - full implementation uses awslambda.streamifyResponse
    const response = await generateStreamingResponse(
      chatRequest.message,
      session.session_id,
      requestLogger
    );

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
        'X-Request-ID': correlationId,
      },
      body: response,
    };
  } catch (error) {
    requestLogger.error('Streaming chat handler error', { error });
    return createErrorResponse(
      500,
      'InternalError',
      'An unexpected error occurred'
    );
  }
}

/**
 * Generate streaming response with agent steps
 */
async function generateStreamingResponse(
  query: string,
  sessionId: string,
  _requestLogger: ReturnType<typeof createRequestLogger>
): Promise<string> {
  const events: StreamEvent[] = [];

  // Event 1: thought - analyze query
  events.push({
    event: 'thought',
    data: { thought: `Analyzing query: "${query}"` },
  });

  // Event 2: action - decompose query
  const decomposition = await decomposeQuery(query);
  events.push({
    event: 'action',
    data: {
      tool: 'query-planner',
      input: JSON.stringify(decomposition.subQueries),
    },
  });

  // Event 3: action + observation - retrieve
  const results = await retrieve(query);
  events.push({
    event: 'action',
    data: { tool: 'retrieve', input: query },
  });
  events.push({
    event: 'observation',
    data: {
      chunks: results.length,
      sources: results.map(r => r.metadata.source),
    },
  });

  // Event 4: reflection - check sufficiency
  const { context } = assembleContext(results);
  const sufficiency = await checkSufficiency(query, context);
  events.push({
    event: 'reflection',
    data: {
      complete: sufficiency.sufficient,
      reasoning: sufficiency.sufficient
        ? 'Context sufficient'
        : 'Need more context',
    },
  });

  // Event 5: message - generate answer
  const systemPrompt = await getSystemPrompt();
  const { text: answer, tokenUsage } = await generate(
    `Context:\n${context}\n\nQuestion: ${query}\n\nAnswer:`,
    systemPrompt
  );

  // Stream answer in chunks
  const chunkSize = 20;
  for (let i = 0; i < answer.length; i += chunkSize) {
    const chunk = answer.slice(i, i + chunkSize);
    events.push({
      event: 'message',
      data: { session_id: sessionId, chunk },
    });
  }

  // Event 6: done - citations and token usage
  const citations = extractCitations(results);
  events.push({
    event: 'done',
    data: {
      citations,
      token_usage: tokenUsage,
    },
  });

  // Format as SSE
  return events
    .map(e => `event: ${e.event}\ndata: ${JSON.stringify(e.data)}\n\n`)
    .join('');
}

function createErrorResponse(
  statusCode: number,
  code: string,
  message: string
): APIGatewayProxyResultV2 {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      error: code,
      message,
    }),
  };
}

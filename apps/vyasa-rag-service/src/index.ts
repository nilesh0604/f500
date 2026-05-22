/**
 * Vyasa Intelligence RAG Service
 * Lambda entry point for agentic RAG API
 *
 * Endpoints:
 * - GET /health - Health check
 * - POST /chat - Non-streaming chat
 * - POST /chat/stream - SSE streaming chat
 * - POST /admin/ingest - Document ingestion
 */

import {
  APIGatewayProxyEventV2,
  APIGatewayProxyResultV2,
  Context,
} from 'aws-lambda';
import { logger } from './lib/logger';

// Import handlers
import * as healthHandler from './handlers/health';
import * as chatHandler from './handlers/chat';
import * as chatStreamHandler from './handlers/chat-stream';
import * as ingestHandler from './handlers/ingest';

/**
 * Main Lambda handler
 * Routes requests to appropriate handler based on path and method
 */
export async function handler(
  event: APIGatewayProxyEventV2,
  context: Context
): Promise<APIGatewayProxyResultV2> {
  // Set correlation ID for logging
  const correlationId = event.requestContext?.requestId || context.awsRequestId;
  const requestLogger = logger.child({
    correlationId,
    lambdaRequestId: context.awsRequestId,
  });

  requestLogger.info('Request received', {
    path: event.rawPath,
    method: event.requestContext?.http?.method,
  });

  // Route to appropriate handler
  const { rawPath, requestContext } = event;
  const method = requestContext?.http?.method;

  try {
    // Health check
    if (rawPath === '/health' && method === 'GET') {
      return await healthHandler.handler(event);
    }

    // Chat (non-streaming)
    if (rawPath === '/chat' && method === 'POST') {
      return await chatHandler.handler(event);
    }

    // Chat (streaming)
    if (rawPath === '/chat/stream' && method === 'POST') {
      return await chatStreamHandler.handler(event);
    }

    // Document ingestion
    if (rawPath === '/admin/ingest' && method === 'POST') {
      return await ingestHandler.handler(event);
    }

    // 404 for unknown paths
    requestLogger.warn('Unknown path', { path: rawPath, method });
    return {
      statusCode: 404,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        error: 'NotFound',
        message: `Path not found: ${method} ${rawPath}`,
      }),
    };
  } catch (error) {
    requestLogger.error('Unhandled error', { error });
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        error: 'InternalError',
        message: 'An unexpected error occurred',
      }),
    };
  }
}

// Export individual handlers for direct invocation
export { healthHandler, chatHandler, chatStreamHandler, ingestHandler };

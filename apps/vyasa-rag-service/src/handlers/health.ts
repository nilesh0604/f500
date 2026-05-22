/**
 * Health check handler
 * GET /health
 */

import { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { HealthResponse } from '../types';
import { logger } from '../lib/logger';

const VERSION = process.env.npm_package_version || '1.0.0';

export async function handler(
  event: APIGatewayProxyEventV2
): Promise<APIGatewayProxyResultV2> {
  const requestId = event.requestContext?.requestId || 'unknown';
  const requestLogger = logger.child({ correlationId: requestId });

  try {
    requestLogger.debug('Health check requested');

    // Check dependencies (simplified - in production, check actual services)
    const dependencies = await checkDependencies();

    const response: HealthResponse = {
      status: dependencies.healthy ? 'healthy' : 'degraded',
      version: VERSION,
      timestamp: new Date().toISOString(),
      dependencies: {
        bedrock: 'ok',
        dynamodb: 'ok',
        s3: 'ok',
      },
    };

    const statusCode = dependencies.healthy ? 200 : 503;

    return {
      statusCode,
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(response),
    };
  } catch (error) {
    requestLogger.error('Health check failed', { error });

    return {
      statusCode: 503,
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        status: 'unhealthy',
        version: VERSION,
        timestamp: new Date().toISOString(),
      }),
    };
  }
}

/**
 * Check service dependencies
 */
async function checkDependencies(): Promise<{ healthy: boolean }> {
  // In a full implementation, ping each service
  // For now, assume healthy
  return { healthy: true };
}

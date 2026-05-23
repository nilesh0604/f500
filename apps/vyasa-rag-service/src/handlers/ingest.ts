/**
 * Document ingestion handler (admin)
 * POST /admin/ingest
 */

import { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { v4 as uuidv4 } from 'uuid';
import {
  BedrockAgentClient,
  StartIngestionJobCommand,
  GetIngestionJobCommand,
} from '@aws-sdk/client-bedrock-agent';
import { createRequestLogger } from '../lib/logger';
import { IngestRequestInput } from '../types';

const bedrockAgentClient = new BedrockAgentClient({});
const KB_ID = process.env.BEDROCK_KB_ID || '';
const DS_ID = process.env.BEDROCK_DS_ID || '';

export async function handler(
  event: APIGatewayProxyEventV2
): Promise<APIGatewayProxyResultV2> {
  const correlationId = event.requestContext?.requestId || 'unknown';
  const requestLogger = createRequestLogger(correlationId);

  try {
    // Check admin authorization (simplified)
    const authHeader = event.headers?.authorization;
    if (!isAuthorized(authHeader)) {
      return {
        statusCode: 401,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          error: 'Unauthorized',
          message: 'Admin access required',
        }),
      };
    }

    // Parse request
    const body = event.body ? JSON.parse(event.body) : {};

    if (!body.source_uri || !body.source_uri.startsWith('s3://')) {
      return {
        statusCode: 422,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          error: 'ValidationError',
          message: 'source_uri must be an S3 URI',
        }),
      };
    }

    const request: IngestRequestInput = {
      source_uri: body.source_uri,
      sync_mode: body.sync_mode || 'INCREMENTAL',
    };

    requestLogger.info('Ingestion request', {
      source: request.source_uri,
      mode: request.sync_mode,
    });

    // Check if status query (GET-style via POST with job_id)
    if (body.job_id) {
      const statusResult = await bedrockAgentClient.send(
        new GetIngestionJobCommand({
          knowledgeBaseId: KB_ID,
          dataSourceId: DS_ID,
          ingestionJobId: body.job_id,
        })
      );
      const job = statusResult.ingestionJob!;
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          job_id: job.ingestionJobId,
          status: job.status,
          stats: job.statistics,
          started_at: job.startedAt,
          updated_at: job.updatedAt,
        }),
      };
    }

    // Start new ingestion job
    const result = await bedrockAgentClient.send(
      new StartIngestionJobCommand({
        knowledgeBaseId: KB_ID,
        dataSourceId: DS_ID,
        clientToken: uuidv4(),
      })
    );

    const job = result.ingestionJob!;
    requestLogger.info('Ingestion job started', { jobId: job.ingestionJobId });

    return {
      statusCode: 202,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        job_id: job.ingestionJobId,
        status: job.status,
        message: 'Bedrock KB ingestion job started successfully.',
      }),
    };
  } catch (error) {
    requestLogger.error('Ingest handler error', { error });
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

/**
 * Check if request is authorized
 */
function isAuthorized(authHeader: string | undefined): boolean {
  // Simplified auth - in production, verify JWT or API key
  // This is a placeholder for actual auth implementation
  return !!authHeader && authHeader.startsWith('Bearer ');
}

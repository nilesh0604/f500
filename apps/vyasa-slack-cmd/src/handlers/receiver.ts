/**
 * Receiver Lambda handler — entry point for Slack slash command.
 * Verifies Slack HMAC signature, acks immediately, fire-and-forgets worker.
 */

import type {
  APIGatewayProxyEventV2,
  APIGatewayProxyResultV2,
} from 'aws-lambda';
import {
  SecretsManagerClient,
  GetSecretValueCommand,
} from '@aws-sdk/client-secrets-manager';
import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda';
import { v4 as uuidv4 } from 'uuid';
import { verifySlackSignature } from '../lib/slack-verifier';
import { validateResponseUrl } from '../lib/response-url-validator';
import { createRequestLogger } from '../lib/logger';
import type {
  SlackSlashCommandPayload,
  SlackWorkerPayload,
  SlackMessageResponse,
} from '@orderflow/shared-types';

const secretsClient = new SecretsManagerClient({
  region: 'us-east-1',
  maxAttempts: 3,
});
const lambdaClient = new LambdaClient({ region: 'us-east-1', maxAttempts: 3 });

/** Signing secret cached after first cold-start fetch from Secrets Manager. */
let cachedSigningSecret: string | null = null;

async function getSigningSecret(): Promise<string> {
  if (cachedSigningSecret) return cachedSigningSecret;

  const secretArn = process.env.SLACK_SECRET_ARN;
  if (!secretArn) throw new Error('SLACK_SECRET_ARN not configured');

  const result = await secretsClient.send(
    new GetSecretValueCommand({ SecretId: secretArn })
  );
  const parsed = JSON.parse(result.SecretString ?? '{}') as Record<
    string,
    string
  >;
  cachedSigningSecret = parsed.signing_secret;
  return cachedSigningSecret;
}

function decodeBody(event: APIGatewayProxyEventV2): string {
  const raw = event.body ?? '';
  return event.isBase64Encoded
    ? Buffer.from(raw, 'base64').toString('utf8')
    : raw;
}

function parseSlashPayload(rawBody: string): SlackSlashCommandPayload {
  const p = new URLSearchParams(rawBody);
  return {
    command: p.get('command') ?? '',
    text: p.get('text') ?? '',
    response_url: p.get('response_url') ?? '',
    user_id: p.get('user_id') ?? '',
    channel_id: p.get('channel_id') ?? '',
    team_id: p.get('team_id') ?? '',
    trigger_id: p.get('trigger_id') ?? '',
  };
}

function json(statusCode: number, body: unknown): APIGatewayProxyResultV2 {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  };
}

/** Lambda entry point (Lambda Function URL, payload format 2.0). */
export async function handler(
  event: APIGatewayProxyEventV2
): Promise<APIGatewayProxyResultV2> {
  const correlationId = uuidv4();
  const log = createRequestLogger(correlationId);

  const method = event.requestContext.http.method;
  const path = event.rawPath;

  if (method === 'GET' && (path === '/health' || path === '/health/')) {
    return json(200, {
      status: 'ok',
      service: 'vyasa-slack-cmd',
      timestamp: new Date().toISOString(),
    });
  }

  if (method !== 'POST') {
    return json(405, { error: 'method_not_allowed' });
  }

  const slackSignature =
    event.headers['x-slack-signature'] ??
    event.headers['X-Slack-Signature'] ??
    '';
  const slackTimestamp =
    event.headers['x-slack-request-timestamp'] ??
    event.headers['X-Slack-Request-Timestamp'] ??
    '';
  const rawBody = decodeBody(event);

  let signingSecret: string;
  try {
    signingSecret = await getSigningSecret();
  } catch (err) {
    log.error('Failed to retrieve Slack signing secret', {
      error: String(err),
    });
    return json(500, { error: 'internal_error' });
  }

  if (
    !verifySlackSignature(
      signingSecret,
      rawBody,
      slackSignature,
      slackTimestamp
    )
  ) {
    log.warn('Slack signature verification failed');
    return json(401, { error: 'invalid_signature' });
  }

  const payload = parseSlashPayload(rawBody);
  const question = payload.text.trim();

  if (!question) {
    const usage: SlackMessageResponse = {
      response_type: 'ephemeral',
      text: 'Usage: `/vyasa <your question>`',
    };
    return json(200, usage);
  }

  try {
    validateResponseUrl(payload.response_url);
  } catch (err) {
    log.warn('Invalid response_url rejected', { error: String(err) });
    return json(400, { error: 'invalid_response_url' });
  }

  const workerArn = process.env.WORKER_LAMBDA_ARN;
  if (!workerArn) {
    log.error('WORKER_LAMBDA_ARN not configured');
    return json(500, { error: 'internal_error' });
  }

  const workerPayload: SlackWorkerPayload = {
    question,
    response_url: payload.response_url,
    correlation_id: correlationId,
  };

  try {
    await lambdaClient.send(
      new InvokeCommand({
        FunctionName: workerArn,
        InvocationType: 'Event',
        Payload: Buffer.from(JSON.stringify(workerPayload)),
      })
    );
  } catch (err) {
    log.error('Failed to invoke worker Lambda', { error: String(err) });
    return json(500, { error: 'internal_error' });
  }

  log.info('Slack command accepted', { questionLength: question.length });

  const ack: SlackMessageResponse = {
    response_type: 'in_channel',
    text: 'Asking Vyasa\u2026 :hourglass_flowing_sand:',
  };
  return json(200, ack);
}

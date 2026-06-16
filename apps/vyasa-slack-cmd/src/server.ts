/**
 * Local dev server — wraps Lambda handlers for local testing.
 * Run with: npx tsx apps/vyasa-slack-cmd/src/server.ts
 *
 * Prerequisites:
 * 1. Copy .env.local.example to .env.local and fill in values
 * 2. ngrok http 3000 (to expose to Slack)
 * 3. Configure Slack slash command Request URL to ngrok URL
 */

import express, { Request, Response } from 'express';
import axios from 'axios';
import { verifySlackSignature } from './lib/slack-verifier';
import { validateResponseUrl } from './lib/response-url-validator';
import {
  formatRagResponse,
  buildErrorResponse,
} from './lib/response-formatter';
import { createRequestLogger } from './lib/logger';
import type { SlackSlashCommandPayload } from '@orderflow/shared-types';
import type { Citation, ChatResponse } from '@orderflow/shared-types/rag';
import { v4 as uuidv4 } from 'uuid';

const app = express();
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

const PORT = parseInt(process.env.PORT ?? '3000', 10);
const DEV_MODE = process.env.DEV_MODE === 'true';
const SLACK_SIGNING_SECRET = process.env.SLACK_SIGNING_SECRET;
const VYASA_API_BASE_URL =
  process.env.VYASA_API_BASE_URL ??
  'https://lkbzhoe1pj.execute-api.us-east-1.amazonaws.com';
const RAG_TIMEOUT_MS = parseInt(process.env.RAG_TIMEOUT_MS ?? '28000', 10);

const EPHEMERAL_ERROR =
  'Vyasa is temporarily unavailable \u2014 please try again.';

/** Health check endpoint */
app.get('/health', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    service: 'vyasa-slack-cmd',
    timestamp: new Date().toISOString(),
  });
});

/** Slash command endpoint */
app.post('/', async (req: Request, res: Response) => {
  const correlationId = uuidv4();
  const log = createRequestLogger(correlationId);

  const slackSignature =
    req.headers['x-slack-signature'] ?? req.headers['X-Slack-Signature'] ?? '';
  const slackTimestamp =
    req.headers['x-slack-request-timestamp'] ??
    req.headers['X-Slack-Request-Timestamp'] ??
    '';

  // In dev mode, skip signature verification
  if (!DEV_MODE) {
    if (!SLACK_SIGNING_SECRET) {
      log.error('SLACK_SIGNING_SECRET not configured');
      return res.status(500).json({ error: 'internal_error' });
    }

    if (
      !verifySlackSignature(
        SLACK_SIGNING_SECRET,
        JSON.stringify(req.body),
        slackSignature as string,
        slackTimestamp as string
      )
    ) {
      log.warn('Slack signature verification failed');
      return res.status(401).json({ error: 'invalid_signature' });
    }
  }

  const payload: SlackSlashCommandPayload = {
    command: req.body.command ?? '',
    text: req.body.text ?? '',
    response_url: req.body.response_url ?? '',
    user_id: req.body.user_id ?? '',
    channel_id: req.body.channel_id ?? '',
    team_id: req.body.team_id ?? '',
    trigger_id: req.body.trigger_id ?? '',
  };

  const question = payload.text.trim();

  if (!question) {
    return res.json({
      response_type: 'ephemeral',
      text: 'Usage: `/vyasa <your question>`',
    });
  }

  try {
    validateResponseUrl(payload.response_url);
  } catch (err) {
    log.warn('Invalid response_url rejected', { error: String(err) });
    return res.status(400).json({ error: 'invalid_response_url' });
  }

  // Send immediate ack to Slack
  res.json({
    response_type: 'in_channel',
    text: 'Asking Vyasa\u2026 :hourglass_flowing_sandbox:',
  });

  // Process RAG request asynchronously
  try {
    const ragResponse = await axios.post<ChatResponse>(
      `${VYASA_API_BASE_URL}/chat`,
      { message: question },
      {
        timeout: RAG_TIMEOUT_MS,
        headers: { 'Content-Type': 'application/json' },
      }
    );

    const citations: Citation[] = ragResponse.data.citations ?? [];
    const message = formatRagResponse(ragResponse.data.response, citations);

    await axios.post(
      payload.response_url,
      {
        response_type: 'in_channel',
        replace_original: true,
        text: message,
      },
      { timeout: 5000 }
    );

    log.info('RAG answer delivered to Slack', {
      questionLength: question.length,
      answerLength: ragResponse.data.response.length,
      citations: citations.length,
    });
  } catch (err) {
    log.error('RAG service call failed', { error: String(err) });
    try {
      await axios.post(
        payload.response_url,
        buildErrorResponse(EPHEMERAL_ERROR),
        {
          timeout: 5000,
        }
      );
    } catch (postErr) {
      log.error('Failed to post error to response_url', {
        error: String(postErr),
      });
    }
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Vyasa Slack cmd server running on http://localhost:${PORT}`);
  console.log(`   Health: http://localhost:${PORT}/health`);
  if (DEV_MODE) {
    console.log(`   ⚠️  DEV MODE: Signature verification disabled`);
  }
});

export default app;

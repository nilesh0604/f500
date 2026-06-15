/**
 * Worker Lambda handler — calls Vyasa RAG API and posts the answer to Slack's response_url.
 * Invoked asynchronously (InvocationType: Event) by the receiver handler.
 */

import axios from 'axios';
import { createRequestLogger } from '../lib/logger';
import {
  formatRagResponse,
  buildErrorResponse,
} from '../lib/response-formatter';
import { validateResponseUrl } from '../lib/response-url-validator';
import type { SlackWorkerPayload } from '@orderflow/shared-types';
import type { Citation, ChatResponse } from '@orderflow/shared-types/rag';

const RAG_TIMEOUT_MS = parseInt(process.env.RAG_TIMEOUT_MS ?? '28000', 10);
const VYASA_API_BASE_URL = process.env.VYASA_API_BASE_URL ?? '';

const EPHEMERAL_ERROR =
  'Vyasa is temporarily unavailable \u2014 please try again.';

async function postToSlack(responseUrl: string, body: unknown): Promise<void> {
  await axios.post(responseUrl, body, {
    timeout: 5000,
    headers: { 'Content-Type': 'application/json' },
  });
}

/** Lambda entry point — receives SlackWorkerPayload as the event JSON. */
export async function handler(event: SlackWorkerPayload): Promise<void> {
  const log = createRequestLogger(event.correlation_id);

  try {
    validateResponseUrl(event.response_url);
  } catch (err) {
    log.error('Invalid response_url in worker payload', { error: String(err) });
    return;
  }

  let ragData: ChatResponse;
  try {
    const response = await axios.post<ChatResponse>(
      `${VYASA_API_BASE_URL}/chat`,
      { message: event.question },
      {
        timeout: RAG_TIMEOUT_MS,
        headers: { 'Content-Type': 'application/json' },
      }
    );
    ragData = response.data;
  } catch (err) {
    log.error('RAG service call failed', { error: String(err) });
    try {
      await postToSlack(
        event.response_url,
        buildErrorResponse(EPHEMERAL_ERROR)
      );
    } catch (postErr) {
      log.error('Failed to post error to response_url', {
        error: String(postErr),
      });
    }
    return;
  }

  const citations: Citation[] = ragData.citations ?? [];
  const message = formatRagResponse(ragData.response, citations);

  try {
    await postToSlack(event.response_url, message);
    log.info('RAG answer delivered to Slack', {
      questionLength: event.question.length,
      answerLength: ragData.response.length,
      citations: citations.length,
    });
  } catch (err) {
    log.error('Failed to post answer to response_url', { error: String(err) });
  }
}

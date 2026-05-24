/**
 * Langfuse client configuration
 * Handles authentication and client initialization
 */

import { Langfuse } from 'langfuse';
import { logger } from '../../src/lib/logger';

let langfuseClient: Langfuse | null = null;

/**
 * Initialize Langfuse client with environment variables
 */
export function initLangfuse(): Langfuse {
  if (langfuseClient) {
    return langfuseClient;
  }

  const publicKey = process.env.LANGFUSE_PUBLIC_KEY;
  const secretKey = process.env.LANGFUSE_SECRET_KEY;
  const host = process.env.LANGFUSE_HOST || 'https://cloud.langfuse.com';

  if (!publicKey || !secretKey) {
    throw new Error(
      'LANGFUSE_PUBLIC_KEY and LANGFUSE_SECRET_KEY must be set in environment'
    );
  }

  langfuseClient = new Langfuse({
    publicKey,
    secretKey,
    baseUrl: host,
  });

  logger.info('Langfuse client initialized', { host });
  return langfuseClient;
}

/**
 * Get existing Langfuse client or throw if not initialized
 */
export function getLangfuse(): Langfuse {
  if (!langfuseClient) {
    return initLangfuse();
  }
  return langfuseClient;
}

/**
 * Flush any pending traces before shutdown
 */
export async function flushLangfuse(): Promise<void> {
  if (langfuseClient) {
    await langfuseClient.flush();
    logger.info('Langfuse traces flushed');
  }
}

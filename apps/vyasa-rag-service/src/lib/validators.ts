/**
 * Input validation using Zod schemas
 */

import { z } from 'zod';

/**
 * Chat request validation schema
 */
export const chatRequestSchema = z.object({
  session_id: z.string().uuid().optional(),
  message: z.string().min(1).max(4000),
  stream: z.boolean().optional().default(false),
});

export type ChatRequestInput = z.infer<typeof chatRequestSchema>;

/**
 * Session ID validation
 */
export const sessionIdSchema = z.string().uuid();

/**
 * Query validation for agent
 */
export const querySchema = z.string().min(1).max(4000);

/**
 * Ingest request validation
 */
export const ingestRequestSchema = z.object({
  source_uri: z.string().regex(/^s3:\/\//, 'Must be an S3 URI'),
  sync_mode: z
    .enum(['FULL_SYNC', 'INCREMENTAL'])
    .optional()
    .default('INCREMENTAL'),
});

export type IngestRequestInput = z.infer<typeof ingestRequestSchema>;

/**
 * Validate chat request
 * Returns validated data or throws ZodError
 */
export function validateChatRequest(input: unknown): ChatRequestInput {
  return chatRequestSchema.parse(input);
}

/**
 * Safe validation - returns result object
 */
export function safeValidateChatRequest(input: unknown): {
  success: boolean;
  data?: ChatRequestInput;
  error?: string;
} {
  const result = chatRequestSchema.safeParse(input);

  if (result.success) {
    return { success: true, data: result.data };
  }

  return {
    success: false,
    error: result.error.errors
      .map(e => `${e.path.join('.')}: ${e.message}`)
      .join(', '),
  };
}

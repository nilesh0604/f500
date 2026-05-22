/**
 * Domain types for Vyasa RAG Service
 * Re-exports from shared-types where applicable
 */

import {
  ChatRequest,
  ChatResponse,
  Citation,
  TokenUsage,
  AgentStep,
  Session,
  Message,
  RateLimitCheck,
} from '@orderflow/shared-types/rag';

export {
  ChatRequest,
  ChatResponse,
  Citation,
  TokenUsage,
  AgentStep,
  Session,
  Message,
  RateLimitCheck,
};

/**
 * Bedrock Knowledge Base retrieval result
 */
export interface RetrievalResult {
  content: string;
  metadata: {
    source: string;
    book?: string;
    chapter?: string;
    verse?: string;
    page?: number;
  };
  score: number;
}

/**
 * RAG result after retrieval and generation
 */
export interface RAGResult {
  answer: string;
  citations: Citation[];
  context: string;
  tokenUsage: TokenUsage;
  retrievedResults: RetrievalResult[];
}

/**
 * Agent execution result
 */
export interface AgentResult {
  answer: string;
  citations: Citation[];
  tokenUsage: TokenUsage;
  trace: AgentStep[];
  iterations: number;
}

/**
 * Query decomposition result
 */
export interface QueryDecomposition {
  needsDecomposition: boolean;
  subQueries: string[];
  reasoning: string;
}

/**
 * Context sufficiency check
 */
export interface SufficiencyCheck {
  sufficient: boolean;
  missingInfo?: string;
  confidence: number;
}

/**
 * Answer quality evaluation
 */
export interface QualityEvaluation {
  complete: boolean;
  accurate: boolean;
  issues?: string[];
  confidence: number;
}

/**
 * Prompt template from S3
 */
export interface PromptTemplate {
  name: string;
  version: string;
  content: string;
  metadata: {
    author: string;
    updated_at: string;
    description: string;
  };
}

/**
 * Circuit breaker state
 */
export type CircuitState = 'closed' | 'open' | 'half-open';

/**
 * Circuit breaker configuration
 */
export interface CircuitBreakerConfig {
  failureThreshold: number;
  resetTimeoutMs: number;
  halfOpenMaxCalls: number;
}

/**
 * Lambda response format
 */
export interface LambdaResponse {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
}

/**
 * Health check response
 */
export interface HealthResponse {
  status: 'healthy' | 'unhealthy' | 'degraded';
  version: string;
  timestamp: string;
  dependencies?: {
    bedrock?: 'ok' | 'error';
    dynamodb?: 'ok' | 'error';
    s3?: 'ok' | 'error';
  };
}

/**
 * Environment variables
 */
export interface Environment {
  NODE_ENV: string;
  LOG_LEVEL: string;
  SESSIONS_TABLE: string;
  RATE_LIMITS_TABLE: string;
  PROMPTS_BUCKET: string;
  BEDROCK_KB_ID: string;
  BEDROCK_MODEL_ARN: string;
  EMBEDDING_MODEL_ARN: string;
  MAX_AGENT_ITERATIONS: number;
  SESSION_TTL_DAYS: number;
  RATE_LIMIT_PER_MINUTE: number;
  RATE_LIMIT_PER_HOUR: number;
  GLOBAL_RATE_LIMIT: number;
}

/**
 * DynamoDB session item for storage
 */
export interface SessionItem {
  session_id: string;
  data: string;
  ttl: number;
  updated_at: string;
}

/**
 * SSE stream event
 */
export interface StreamEvent {
  event: string;
  data: unknown;
}

/**
 * Ingest request input
 */
export interface IngestRequestInput {
  source_uri: string;
  sync_mode: 'FULL_SYNC' | 'INCREMENTAL';
}

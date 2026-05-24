/**
 * Task adapter for Langfuse experiments
 * Bridges the Vyasa RAG API to Langfuse evaluation framework
 */

import axios from 'axios';
import { logger } from '../../src/lib/logger';

interface DatasetItem {
  id: string;
  input: string;
  expectedOutput?: string;
  metadata?: {
    category?: string;
    difficulty?: string;
    required_facts?: string[];
    expected_citations?: string[];
    tags?: string[];
  };
}

interface Citation {
  source: string;
  excerpt?: string;
  relevance_score?: number;
  metadata?: {
    book?: string;
    chapter?: string;
    verse?: string;
    page?: number;
  };
}

interface ApiResponse {
  answer: string;
  citations: Citation[];
  session_id?: string;
  metadata?: {
    total_tokens?: number;
    prompt_tokens?: number;
    completion_tokens?: number;
    iterations?: number;
  };
}

interface TaskResult {
  output: string;
  context: string;
  contexts: string[];
  citations: Array<{ source: string; excerpt: string }>;
  metadata: {
    tokens_used: number;
    iterations: number;
    model: string;
    latency_ms: number;
  };
}

/**
 * Configuration for the task adapter
 */
interface AdapterConfig {
  apiEndpoint: string;
  apiKey?: string;
  timeoutMs?: number;
}

function getConfig(): AdapterConfig {
  // Support both local dev server and production API Gateway
  const isLocal = process.env.EVAL_LOCAL === 'true';

  return {
    apiEndpoint:
      process.env.VYASA_API_ENDPOINT ||
      (isLocal
        ? 'http://localhost:3000/chat'
        : 'https://t859xz8d3c.execute-api.us-east-1.amazonaws.com/chat'),
    apiKey: process.env.VYASA_API_KEY,
    timeoutMs: parseInt(process.env.VYASA_API_TIMEOUT || '30000', 10),
  };
}

/**
 * Execute RAG pipeline against live API for one dataset item
 * Returns shape required by Langfuse evaluators
 */
export async function runRagTask(item: DatasetItem): Promise<TaskResult> {
  const config = getConfig();
  const startTime = Date.now();

  logger.info('Running RAG task', {
    testId: item.id,
    query: item.input.substring(0, 50),
  });

  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (config.apiKey) {
      headers.Authorization = `Bearer ${config.apiKey}`;
    }

    const response = await axios.post<ApiResponse>(
      config.apiEndpoint,
      {
        message: item.input,
        session_id: `eval-${item.id}`,
      },
      {
        headers,
        timeout: config.timeoutMs,
      }
    );

    const latencyMs = Date.now() - startTime;
    const data = response.data;

    // Build context string from citations
    const context = data.citations
      .map(c => `[${c.source}]: ${c.excerpt || 'No excerpt'}`)
      .join('\n\n');

    // Contexts as array for RAGAS evaluators
    const contexts = data.citations.map(c => c.excerpt || '').filter(Boolean);

    // Format citations
    const citations = data.citations.map(c => ({
      source: c.source,
      excerpt: c.excerpt || '',
    }));

    const result: TaskResult = {
      output: data.answer,
      context,
      contexts,
      citations,
      metadata: {
        tokens_used: data.metadata?.total_tokens || 0,
        iterations: data.metadata?.iterations || 1,
        model: 'claude-3-sonnet',
        latency_ms: latencyMs,
      },
    };

    logger.info('RAG task completed', {
      testId: item.id,
      latencyMs,
      citations: citations.length,
      tokens: result.metadata.tokens_used,
    });

    return result;
  } catch (error) {
    const latencyMs = Date.now() - startTime;

    if (axios.isAxiosError(error)) {
      logger.error('API request failed', {
        testId: item.id,
        status: error.response?.status,
        message: error.message,
        latencyMs,
      });
    } else {
      logger.error('Unexpected error in RAG task', {
        testId: item.id,
        error: error instanceof Error ? error.message : 'Unknown error',
        latencyMs,
      });
    }

    // Return error result so evaluation continues
    return {
      output: `ERROR: ${error instanceof Error ? error.message : 'Unknown error'}`,
      context: '',
      contexts: [],
      citations: [],
      metadata: {
        tokens_used: 0,
        iterations: 0,
        model: 'error',
        latency_ms: latencyMs,
      },
    };
  }
}

/**
 * Run RAG task with Langfuse experiment integration
 * This is the function passed to runExperiment()
 */
export async function runRagTaskForExperiment(
  datasetItem: DatasetItem
): Promise<TaskResult> {
  return runRagTask(datasetItem);
}

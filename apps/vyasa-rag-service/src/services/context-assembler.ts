/**
 * Context Assembly Service
 * Filters and formats retrieved documents for the LLM
 */

import { RetrievalResult } from '../types';
import { logger } from '../lib/logger';

/**
 * Assemble context from retrieval results
 * - Filters by relevance (75% threshold)
 * - Formats with source attribution
 * - Concatenates with separators
 */
export function assembleContext(results: RetrievalResult[]): {
  context: string;
  filteredCount: number;
  totalCount: number;
} {
  if (results.length === 0) {
    return { context: '', filteredCount: 0, totalCount: 0 };
  }

  // Find max score for threshold calculation
  const maxScore = Math.max(...results.map(r => r.score));
  const threshold = maxScore * 0.75; // 75% threshold per PRD FR-CORE-003

  // Filter results
  const filtered = results.filter(r => r.score >= threshold);

  logger.debug('Assembling context', {
    totalResults: results.length,
    filteredResults: filtered.length,
    maxScore,
    threshold,
  });

  // Format each chunk with source attribution
  const formattedChunks = filtered.map(result => {
    const source = formatSource(result.metadata);
    return `[${source}] ${result.content}`;
  });

  // Join with double newline for readability
  const context = formattedChunks.join('\n\n');

  return {
    context,
    filteredCount: filtered.length,
    totalCount: results.length,
  };
}

/**
 * Format source metadata for attribution
 */
function formatSource(metadata: RetrievalResult['metadata']): string {
  const parts: string[] = [];

  if (metadata.book) {
    parts.push(metadata.book);
  }

  if (metadata.chapter) {
    parts.push(metadata.chapter);
  }

  if (metadata.verse) {
    parts.push(`Verse ${metadata.verse}`);
  }

  if (parts.length > 0) {
    return parts.join(' - ');
  }

  // Fallback to source URI
  return metadata.source.split('/').pop() || 'Unknown';
}

/**
 * Merge multiple contexts from iterative retrieval
 */
export function mergeContexts(contexts: string[]): string {
  // Remove duplicates (simple string deduplication)
  const uniqueContexts = [...new Set(contexts)];

  // Join with clear separator
  return uniqueContexts.join('\n\n---\n\n');
}

/**
 * Estimate token count (rough approximation)
 * 1 token ≈ 4 characters for English text
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Truncate context to fit within token limit
 */
export function truncateContext(context: string, maxTokens: number): string {
  const estimatedTokens = estimateTokens(context);

  if (estimatedTokens <= maxTokens) {
    return context;
  }

  // Rough character limit based on token target
  const charLimit = maxTokens * 4;

  // Try to cut at paragraph boundary
  const truncated = context.slice(0, charLimit);
  const lastBreak = truncated.lastIndexOf('\n\n');

  if (lastBreak > charLimit * 0.5) {
    return truncated.slice(0, lastBreak) + '\n\n[Content truncated]';
  }

  return truncated + ' [Content truncated]';
}

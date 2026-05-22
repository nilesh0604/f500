/**
 * Query Decomposition Service
 * Analyzes queries and breaks complex questions into sub-queries
 */

import { QueryDecomposition } from '../types';
import { generate } from './bedrock-client';
import { logger } from '../lib/logger';

/**
 * Decompose a complex query into sub-queries
 * Simple queries return as-is, complex queries are broken down
 */
export async function decomposeQuery(
  query: string
): Promise<QueryDecomposition> {
  logger.debug('Decomposing query', { query: query.slice(0, 100) });

  // Simple queries don't need decomposition
  if (isSimpleQuery(query)) {
    return {
      needsDecomposition: false,
      subQueries: [query],
      reasoning: 'Simple query - no decomposition needed',
    };
  }

  // Use LLM to analyze and decompose
  const analysis = await analyzeQuery(query);

  logger.info('Query decomposition result', {
    original: query.slice(0, 100),
    subQueries: analysis.subQueries.length,
  });

  return analysis;
}

/**
 * Check if query is simple (single entity, direct question)
 */
function isSimpleQuery(query: string): boolean {
  // Single-hop indicators
  const simplePatterns = [
    /^who is/i,
    /^what is/i,
    /^where is/i,
    /^when did/i,
    /^tell me about/i,
    /^describe/i,
  ];

  // Complex indicators
  const complexPatterns = [
    /\band\b.*\b\w+(?:'s)?\s+(?:father|mother|son|daughter|brother|sister|wife|husband)/i,
    /\bafter\b.*\bbefore\b/i,
    /\bthen\b/i,
    /\bhappened to.*after\b/i,
    /\brelationship between.*and\b/i,
    /\bwho were the parents of\b/i,
    /\bwhat happened to.*when\b/i,
  ];

  // Check for complex patterns first
  if (complexPatterns.some(pattern => pattern.test(query))) {
    return false;
  }

  // Check length (longer queries tend to be complex)
  if (query.length > 150) {
    return false;
  }

  // Check for simple patterns
  return simplePatterns.some(pattern => pattern.test(query));
}

/**
 * Use LLM to analyze and decompose query
 */
async function analyzeQuery(query: string): Promise<QueryDecomposition> {
  const prompt = `Analyze the following question about the Mahabharata and determine if it requires multiple search steps.

Question: "${query}"

Instructions:
1. Identify the main entity/character(s)
2. Determine if multiple facts are needed to answer
3. Break down into sequential sub-queries if needed

Respond in this exact JSON format:
{
  "needsDecomposition": true/false,
  "subQueries": ["query 1", "query 2", ...],
  "reasoning": "brief explanation"
}

Examples:
- "Who was Karna's foster father?" -> needsDecomposition: false, subQueries: ["Karna foster father"]
- "What happened to Arjuna's son after the war?" -> needsDecomposition: true, subQueries: ["Arjuna son name", "Abhimanyu fate after Kurukshetra war"]
- "Who were the parents of Karna's foster father?" -> needsDecomposition: true, subQueries: ["Karna foster father identity", "Adhiratha parents lineage"]`;

  try {
    const { text } = await generate(prompt);

    // Extract JSON from response
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('No JSON found in LLM response');
    }

    const parsed = JSON.parse(jsonMatch[0]);

    return {
      needsDecomposition: parsed.needsDecomposition || false,
      subQueries: Array.isArray(parsed.subQueries)
        ? parsed.subQueries
        : [query],
      reasoning: parsed.reasoning || 'LLM analysis',
    };
  } catch (error) {
    logger.error('Query analysis failed', { error, query });
    // Fallback: return original query
    return {
      needsDecomposition: false,
      subQueries: [query],
      reasoning: 'Analysis failed, using original query',
    };
  }
}

/**
 * Reformulate a query based on previous results
 * Used when initial retrieval is insufficient
 */
export async function reformulateQuery(
  originalQuery: string,
  previousResults: string[],
  missingInfo: string
): Promise<string> {
  const prompt = `The following question was asked: "${originalQuery}"

Previous search results did not contain sufficient information.
Missing: ${missingInfo}

Reformulate the query to better find the needed information.
Respond with only the new search query, nothing else.`;

  try {
    const { text } = await generate(prompt);
    const reformulated = text.trim();

    logger.debug('Query reformulated', {
      original: originalQuery,
      reformulated,
    });
    return reformulated;
  } catch (error) {
    logger.error('Query reformulation failed', { error });
    return originalQuery;
  }
}

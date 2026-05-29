/**
 * Self-Reflection Service
 * Evaluates context sufficiency and answer quality
 */

import { SufficiencyCheck, QualityEvaluation } from '../types';
import { generate } from './bedrock-client';
import { logger } from '../lib/logger';

/**
 * Check if retrieved context is sufficient to answer the query
 */
export async function checkSufficiency(
  query: string,
  context: string
): Promise<SufficiencyCheck> {
  logger.debug('Checking context sufficiency', {
    query: query.slice(0, 100),
    contextLength: context.length,
  });

  // Empty context is never sufficient
  if (!context || context.trim().length === 0) {
    return {
      sufficient: false,
      confidence: 0,
      missingInfo: 'No relevant context retrieved',
    };
  }

  const prompt = `Evaluate if the following context is sufficient to answer the question.

Question: "${query}"

Context:
${context.slice(0, 3000)}

Instructions:
1. Determine if the context contains enough information
2. Identify what specific information is missing (if any)
3. Rate confidence from 0-1

Respond in this exact JSON format:
{
  "sufficient": true/false,
  "missingInfo": "description of what's missing or null if sufficient",
  "confidence": 0.0-1.0
}

Example:
- If context directly answers: {"sufficient": true, "confidence": 0.95}
- If context partially answers: {"sufficient": false, "missingInfo": "Date of birth not found", "confidence": 0.3}`;

  try {
    const { text } = await generate(prompt);

    // Extract JSON
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('No JSON found in sufficiency check');
    }

    const parsed = JSON.parse(jsonMatch[0]);

    const result: SufficiencyCheck = {
      sufficient: parsed.sufficient || false,
      confidence: parsed.confidence || 0,
      missingInfo: parsed.missingInfo || undefined,
    };

    logger.debug('Sufficiency check result', {
      sufficient: result.sufficient,
      confidence: result.confidence,
    });

    return result;
  } catch (error) {
    logger.error('Sufficiency check failed', { error });
    // Fail safe: assume insufficient
    return {
      sufficient: false,
      confidence: 0,
      missingInfo: 'Error checking sufficiency',
    };
  }
}

/**
 * Evaluate the quality of the generated answer
 */
export async function evaluateAnswer(
  query: string,
  answer: string,
  context?: string
): Promise<QualityEvaluation> {
  logger.debug('Evaluating answer quality', {
    query: query.slice(0, 100),
    answerLength: answer.length,
  });

  const contextSection = context
    ? `\n\nRetrieved Context:\n${context.slice(0, 2000)}`
    : '';

  const prompt = `Evaluate the quality of the following answer.${contextSection}

Question: "${query}"

Answer: "${answer}"

Evaluate on:
1. Completeness: Does it fully answer the question?
2. Accuracy: Is the information correct and grounded in context?
3. Clarity: Is the answer clear and well-structured?

Respond in this exact JSON format:
{
  "complete": true/false,
  "accurate": true/false,
  "issues": ["issue 1", "issue 2"],
  "confidence": 0.0-1.0
}

confidence should be your overall confidence in the answer quality (0-1).`;

  try {
    const { text } = await generate(prompt);

    // Extract JSON
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('No JSON found in quality evaluation');
    }

    const parsed = JSON.parse(jsonMatch[0]);

    const result: QualityEvaluation = {
      complete: parsed.complete || false,
      accurate: parsed.accurate || false,
      issues: parsed.issues || [],
      confidence: parsed.confidence || 0,
    };

    logger.debug('Quality evaluation result', {
      complete: result.complete,
      accurate: result.accurate,
      confidence: result.confidence,
    });

    return result;
  } catch (error) {
    logger.error('Quality evaluation failed', { error });
    // Fail safe
    return {
      complete: false,
      accurate: false,
      issues: ['Error evaluating answer'],
      confidence: 0,
    };
  }
}

/**
 * Quick sufficiency check without LLM call
 * Used for simple cases to save costs
 */
export function quickSufficiencyCheck(
  query: string,
  context: string,
  retrievedCount: number
): SufficiencyCheck {
  // No results
  if (retrievedCount === 0) {
    return {
      sufficient: false,
      confidence: 0,
      missingInfo: 'No documents retrieved',
    };
  }

  // Very short context
  if (context.length < 50) {
    return {
      sufficient: false,
      confidence: 0.2,
      missingInfo: 'Insufficient context length',
    };
  }

  // Check for key terms from query in context
  const queryTerms = query
    .toLowerCase()
    .split(/\s+/)
    .filter(term => term.length > 3);

  const contextLower = context.toLowerCase();
  const matchedTerms = queryTerms.filter(term => contextLower.includes(term));
  const matchRatio = matchedTerms.length / queryTerms.length;

  if (matchRatio < 0.3) {
    return {
      sufficient: false,
      confidence: 0.3,
      missingInfo: 'Query terms not found in context',
    };
  }

  // Seems sufficient
  return {
    sufficient: true,
    confidence: Math.min(0.7 + matchRatio * 0.3, 0.95),
  };
}

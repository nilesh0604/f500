/**
 * Corrected Answer Relevance scorer
 *
 * The Langfuse LLM eval job "Answer Relevance" uses a noncommittal rubric
 * where 0 = committal (good) and 1 = noncommittal (bad). Storing that raw
 * value inverts the metric — good answers score 0.
 *
 * This module computes the correct Answer Relevance score:
 *   1 = relevant / committal answer
 *   0 = irrelevant / noncommittal answer
 *
 * Detection logic mirrors the RAGAS noncommittal heuristic used by the
 * Langfuse eval job prompt, so scores are comparable after inversion.
 */

const NONCOMMITTAL_PHRASES = [
  "i don't know",
  'i do not know',
  "i'm not sure",
  'i am not sure',
  'cannot find',
  'not found in',
  'no information',
  'insufficient information',
  'not enough information',
  'outside the scope',
  'not in the',
  'unable to answer',
  'cannot answer',
  'not provided',
  'not mentioned',
];

/**
 * Detect whether an answer is noncommittal (evasive / vague).
 * Returns true when the answer hedges rather than provides a direct response.
 */
function isNoncommittal(answer: string): boolean {
  const lower = answer.toLowerCase();
  return NONCOMMITTAL_PHRASES.some(phrase => lower.includes(phrase));
}

/**
 * Calculate Answer Relevance as the inverse of the noncommittal flag.
 *
 * Score semantics:
 *   1.0 — answer is committal and contains query terms (fully relevant)
 *   0.5 — answer is committal but has low query-term overlap
 *   0.0 — answer is noncommittal (evasive / vague)
 *
 * @param answer  - The generated RAG answer
 * @param query   - The original user question
 * @returns Score in [0, 1] where higher = more relevant
 */
export function calculateAnswerRelevance(
  answer: string,
  query: string
): number {
  if (isNoncommittal(answer)) {
    return 0.0;
  }

  const queryTerms = query
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter(t => t.length > 3);

  if (queryTerms.length === 0) {
    return 1.0;
  }

  const answerLower = answer.toLowerCase();
  const matchCount = queryTerms.filter(t => answerLower.includes(t)).length;
  const termCoverage = matchCount / queryTerms.length;

  return termCoverage >= 0.3 ? 1.0 : 0.5;
}

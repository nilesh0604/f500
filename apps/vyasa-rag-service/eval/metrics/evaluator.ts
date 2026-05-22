/**
 * Evaluation metrics for Vyasa RAG
 * Measures accuracy, relevance, citation quality, latency
 */

import {
  EvaluationResult,
  EvaluationMetrics,
  TestCase,
  ChatResponse,
  AgentStep,
  Citation,
} from '../../src/types';

/**
 * Evaluate a single response against a test case
 */
export async function evaluateResponse(
  testCase: TestCase,
  response: ChatResponse,
  latencyMs: number,
  trace?: AgentStep[]
): Promise<EvaluationResult> {
  const metrics: EvaluationMetrics = {
    // Answer accuracy (semantic similarity to expected answer)
    accuracy: calculateAccuracy(response.response, testCase.expected_answer),

    // Citation quality
    citationPrecision: calculateCitationPrecision(
      response.citations,
      testCase.expected_citations
    ),
    citationRecall: calculateCitationRecall(
      response.citations,
      testCase.expected_citations
    ),
    citationF1: 0, // Calculated below

    // Completeness (required facts coverage)
    completeness: calculateCompleteness(
      response.response,
      testCase.required_facts
    ),

    // Response quality
    relevance: calculateRelevance(response.response, testCase.query),
    conciseness: calculateConciseness(response.response),

    // Performance
    latencyMs,
    tokensUsed: response.token_usage?.total_tokens || 0,

    // Agent effectiveness
    iterationsUsed: trace?.filter(s => s.type === 'action').length || 1,
  };

  // Calculate F1 score
  metrics.citationF1 =
    (2 * (metrics.citationPrecision || 0) * (metrics.citationRecall || 0)) /
    ((metrics.citationPrecision || 0) + (metrics.citationRecall || 0) || 1);

  // Overall score (weighted average)
  const overallScore = calculateOverallScore(metrics);

  // Pass/fail determination
  const passed = determinePassFail(testCase, metrics);

  return {
    testId: testCase.id,
    query: testCase.query,
    expectedAnswer: testCase.expected_answer,
    actualAnswer: response.response,
    metrics,
    overallScore,
    passed,
    trace,
    citations: response.citations,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Calculate accuracy using keyword matching and semantic overlap
 * Returns score between 0 and 1
 */
function calculateAccuracy(actual: string, expected: string): number {
  // Normalize strings
  const actualNorm = normalizeText(actual);
  const expectedNorm = normalizeText(expected);

  // Special case: out-of-scope questions
  if (expected === 'OUT_OF_SCOPE') {
    // Check if response indicates out-of-scope appropriately
    const outOfScopeIndicators = [
      'not in the mahabharata',
      'outside the scope',
      'not found in',
      'cannot answer',
      'no information',
    ];
    const hasIndicator = outOfScopeIndicators.some(ind =>
      actualNorm.includes(ind)
    );
    return hasIndicator ? 1.0 : 0.0; // Should indicate out-of-scope
  }

  // Extract key terms from expected answer
  const expectedTerms = extractKeyTerms(expectedNorm);

  // Count matches
  let matches = 0;
  for (const term of expectedTerms) {
    if (actualNorm.includes(term)) {
      matches++;
    }
  }

  // Calculate precision and recall
  const precision =
    expectedTerms.length > 0 ? matches / expectedTerms.length : 0;

  // Check for exact answer match bonus
  const hasExactMatch =
    actualNorm.includes(expectedNorm) || expectedNorm.includes(actualNorm);
  const exactBonus = hasExactMatch ? 0.2 : 0;

  return Math.min(precision + exactBonus, 1.0);
}

/**
 * Calculate citation precision (retrieved citations that are relevant)
 */
function calculateCitationPrecision(
  actual: Citation[],
  expected: string[]
): number {
  if (actual.length === 0) return expected.length === 0 ? 1.0 : 0.0;

  // Count citations that match expected books/chapters
  let relevantCount = 0;
  for (const citation of actual) {
    const isRelevant = expected.some(
      exp =>
        citation.book?.toLowerCase().includes(exp.toLowerCase()) ||
        citation.title.toLowerCase().includes(exp.toLowerCase())
    );
    if (isRelevant) relevantCount++;
  }

  return relevantCount / actual.length;
}

/**
 * Calculate citation recall (expected citations that were retrieved)
 */
function calculateCitationRecall(
  actual: Citation[],
  expected: string[]
): number {
  if (expected.length === 0) return actual.length === 0 ? 1.0 : 1.0; // No citations expected

  // Count expected citations that were found
  let foundCount = 0;
  for (const exp of expected) {
    const isFound = actual.some(
      cit =>
        cit.book?.toLowerCase().includes(exp.toLowerCase()) ||
        cit.title.toLowerCase().includes(exp.toLowerCase())
    );
    if (isFound) foundCount++;
  }

  return foundCount / expected.length;
}

/**
 * Calculate completeness based on required facts
 */
function calculateCompleteness(
  answer: string,
  requiredFacts: string[]
): number {
  if (requiredFacts.length === 0) return 1.0;

  const answerNorm = normalizeText(answer);
  let coveredCount = 0;

  for (const fact of requiredFacts) {
    const factTerms = extractKeyTerms(fact);
    // Check if at least one key term from each fact is present
    const hasMatch = factTerms.some(term => answerNorm.includes(term));
    if (hasMatch) coveredCount++;
  }

  return coveredCount / requiredFacts.length;
}

/**
 * Calculate relevance to the query
 */
function calculateRelevance(answer: string, query: string): number {
  const queryTerms = extractKeyTerms(query);
  const answerNorm = normalizeText(answer);

  if (queryTerms.length === 0) return 1.0;

  // Check if query terms appear in answer
  const matches = queryTerms.filter(term => answerNorm.includes(term)).length;
  const termCoverage = matches / queryTerms.length;

  // Penalty for very short or very long answers
  const wordCount = answer.split(/\s+/).length;
  let lengthScore = 1.0;
  if (wordCount < 10) lengthScore = 0.7; // Too short
  if (wordCount > 500) lengthScore = 0.8; // Too long

  return termCoverage * lengthScore;
}

/**
 * Calculate conciseness (avoiding unnecessary verbosity)
 */
function calculateConciseness(answer: string): number {
  const words = answer.split(/\s+/).length;

  // Ideal range: 20-150 words
  if (words >= 20 && words <= 150) return 1.0;
  if (words < 20) return 0.8; // A bit short
  if (words <= 200) return 0.9; // Slightly long
  if (words <= 300) return 0.7; // Too long
  return 0.5; // Very long
}

/**
 * Calculate overall score as weighted average
 */
function calculateOverallScore(metrics: EvaluationMetrics): number {
  const weights = {
    accuracy: 0.35,
    citationF1: 0.2,
    completeness: 0.2,
    relevance: 0.15,
    conciseness: 0.1,
  };

  return (
    (metrics.accuracy || 0) * weights.accuracy +
    (metrics.citationF1 || 0) * weights.citationF1 +
    (metrics.completeness || 0) * weights.completeness +
    (metrics.relevance || 0) * weights.relevance +
    (metrics.conciseness || 0) * weights.conciseness
  );
}

/**
 * Determine if test case passed based on metrics
 */
function determinePassFail(
  testCase: TestCase,
  metrics: EvaluationMetrics
): boolean {
  // Different thresholds based on difficulty
  const thresholds = {
    easy: { accuracy: 0.8, completeness: 0.8, overall: 0.75 },
    medium: { accuracy: 0.7, completeness: 0.7, overall: 0.7 },
    hard: { accuracy: 0.6, completeness: 0.6, overall: 0.65 },
  };

  const threshold =
    thresholds[testCase.difficulty as keyof typeof thresholds] ||
    thresholds.medium;

  // Edge cases (out-of-scope) have different criteria
  if (testCase.expected_answer === 'OUT_OF_SCOPE') {
    return metrics.accuracy === 1.0; // Must correctly identify out-of-scope
  }

  return (
    (metrics.accuracy || 0) >= threshold.accuracy &&
    (metrics.completeness || 0) >= threshold.completeness &&
    calculateOverallScore(metrics) >= threshold.overall
  );
}

/**
 * Normalize text for comparison
 */
function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Extract key terms from text
 */
function extractKeyTerms(text: string): string[] {
  const stopWords = new Set([
    'the',
    'a',
    'an',
    'is',
    'are',
    'was',
    'were',
    'be',
    'been',
    'being',
    'have',
    'has',
    'had',
    'do',
    'does',
    'did',
    'will',
    'would',
    'could',
    'should',
    'may',
    'might',
    'must',
    'shall',
    'can',
    'need',
    'dare',
    'ought',
    'used',
    'to',
    'of',
    'in',
    'for',
    'on',
    'with',
    'at',
    'by',
    'from',
    'as',
    'into',
    'through',
    'during',
    'before',
    'after',
    'above',
    'below',
    'between',
    'under',
    'again',
    'further',
    'then',
    'once',
    'and',
    'but',
    'or',
    'yet',
    'so',
    'if',
    'because',
    'although',
    'though',
    'while',
    'where',
    'when',
    'that',
    'which',
    'who',
    'whom',
    'whose',
    'what',
    'this',
    'these',
    'those',
    'i',
    'me',
    'my',
    'myself',
    'we',
    'our',
    'ours',
    'ourselves',
    'you',
    'your',
    'yours',
    'yourself',
    'yourselves',
    'he',
    'him',
    'his',
    'himself',
    'she',
    'her',
    'hers',
    'herself',
    'it',
    'its',
    'itself',
    'they',
    'them',
    'their',
    'theirs',
    'themselves',
    'what',
    'which',
    'who',
    'whom',
    'this',
    'that',
    'these',
    'those',
    'am',
    'is',
    'are',
    'was',
    'were',
    'be',
    'been',
    'being',
    'have',
    'has',
    'had',
    'having',
    'do',
    'does',
    'did',
    'doing',
    's',
    't',
    'just',
    'don',
    'should',
    'now',
    'how',
    'why',
    'where',
    'here',
    'there',
    'when',
    'while',
    'if',
    'then',
    'than',
    'too',
    'very',
    'can',
    'will',
    'just',
    'should',
    'now',
    'get',
    'also',
    'use',
    'using',
    'used',
    'uses',
    'tell',
    'about',
    'who',
    'was',
    'were',
    'did',
    'does',
    'done',
    'were',
    'being',
    'having',
    'had',
    'has',
    'have',
    'get',
    'gets',
    'got',
    'gotten',
    'getting',
    'make',
    'makes',
    'made',
    'making',
  ]);

  return normalizeText(text)
    .split(' ')
    .filter(term => term.length > 2 && !stopWords.has(term))
    .filter((term, index, arr) => arr.indexOf(term) === index); // unique
}

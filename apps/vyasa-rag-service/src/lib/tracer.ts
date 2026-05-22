/**
 * X-Ray tracing wrapper
 * Tracks agent loop subsegments
 */

import AWSXRay from 'aws-xray-sdk-core';

/**
 * Create a subsegment for tracing
 */
export function createSubsegment(name: string): AWSXRay.Subsegment | undefined {
  const segment = AWSXRay.getSegment();
  if (!segment) {
    return undefined;
  }

  return segment.addNewSubsegment(name);
}

/**
 * Close a subsegment
 */
export function closeSubsegment(subsegment?: AWSXRay.Subsegment): void {
  if (subsegment) {
    subsegment.close();
  }
}

/**
 * Trace an async function with X-Ray
 */
export async function traceFunction<T>(
  name: string,
  fn: () => Promise<T>,
  metadata?: Record<string, unknown>
): Promise<T> {
  const subsegment = createSubsegment(name);

  if (metadata && subsegment) {
    Object.entries(metadata).forEach(([key, value]) => {
      subsegment.addMetadata(key, value);
    });
  }

  try {
    const result = await fn();
    closeSubsegment(subsegment);
    return result;
  } catch (error) {
    if (subsegment && error instanceof Error) {
      subsegment.addError(error);
    }
    closeSubsegment(subsegment);
    throw error;
  }
}

/**
 * Trace agent step
 */
export function traceAgentStep(
  step: number,
  type: string,
  subsegment?: AWSXRay.Subsegment
): void {
  if (subsegment) {
    subsegment.addAnnotation('agent_step', step);
    subsegment.addAnnotation('agent_type', type);
  }
}

/**
 * Add query metadata to segment
 */
export function addQueryMetadata(
  subsegment: AWSXRay.Subsegment | undefined,
  query: string,
  decomposition?: { needsDecomposition: boolean; subQueries: string[] }
): void {
  if (!subsegment) return;

  subsegment.addMetadata('query_length', query.length);
  subsegment.addMetadata('query_preview', query.slice(0, 100));

  if (decomposition) {
    subsegment.addAnnotation(
      'needs_decomposition',
      decomposition.needsDecomposition
    );
    subsegment.addMetadata('subquery_count', decomposition.subQueries.length);
  }
}

/**
 * Add retrieval metadata to segment
 */
export function addRetrievalMetadata(
  subsegment: AWSXRay.Subsegment | undefined,
  resultCount: number,
  topScore: number,
  durationMs: number
): void {
  if (!subsegment) return;

  subsegment.addAnnotation('retrieval_results', resultCount);
  subsegment.addMetadata('retrieval_top_score', Math.round(topScore * 100));
  subsegment.addMetadata('retrieval_duration_ms', durationMs);
}

/**
 * Add generation metadata to segment
 */
export function addGenerationMetadata(
  subsegment: AWSXRay.Subsegment | undefined,
  inputTokens: number,
  outputTokens: number,
  durationMs: number,
  modelId?: string
): void {
  if (!subsegment) return;

  subsegment.addAnnotation('input_tokens', inputTokens);
  subsegment.addAnnotation('output_tokens', outputTokens);
  subsegment.addMetadata('generation_duration_ms', durationMs);

  if (modelId) {
    subsegment.addMetadata('model_id', modelId);
  }
}

/**
 * Add response metadata to segment
 */
export function addResponseMetadata(
  subsegment: AWSXRay.Subsegment | undefined,
  answerLength: number,
  citationCount: number,
  iterations: number,
  passedReflection: boolean
): void {
  if (!subsegment) return;

  subsegment.addAnnotation('answer_length', answerLength);
  subsegment.addAnnotation('citation_count', citationCount);
  subsegment.addAnnotation('agent_iterations', iterations);
  subsegment.addAnnotation('passed_reflection', passedReflection);
}

/**
 * Get current trace ID for logging correlation
 */
export function getTraceId(): string | undefined {
  const segment = AWSXRay.getSegment();
  if (segment && 'trace_id' in segment) {
    return segment.trace_id;
  }
  return undefined;
}

/**
 * Get current segment ID for logging correlation
 */
export function getSegmentId(): string | undefined {
  const segment = AWSXRay.getSegment();
  if (segment && 'id' in segment) {
    return segment.id;
  }
  return undefined;
}

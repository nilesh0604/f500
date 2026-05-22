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

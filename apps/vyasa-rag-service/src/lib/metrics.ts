/**
 * Custom CloudWatch metrics for Vyasa RAG
 * Tracks business-level metrics: token usage, agent iterations, feedback
 */

import {
  CloudWatchClient,
  PutMetricDataCommand,
} from '@aws-sdk/client-cloudwatch';
import { logger } from './logger';

const cloudwatch = new CloudWatchClient({});
const NAMESPACE = 'VyasaRAG';

/**
 * Publish Bedrock token usage metrics
 */
export async function publishTokenMetrics(
  inputTokens: number,
  outputTokens: number,
  operation: string
): Promise<void> {
  const timestamp = new Date();

  try {
    await cloudwatch.send(
      new PutMetricDataCommand({
        Namespace: NAMESPACE,
        MetricData: [
          {
            MetricName: 'BedrockInputTokens',
            Value: inputTokens,
            Unit: 'Count',
            Timestamp: timestamp,
            Dimensions: [{ Name: 'Operation', Value: operation }],
          },
          {
            MetricName: 'BedrockOutputTokens',
            Value: outputTokens,
            Unit: 'Count',
            Timestamp: timestamp,
            Dimensions: [{ Name: 'Operation', Value: operation }],
          },
          {
            MetricName: 'BedrockTotalTokens',
            Value: inputTokens + outputTokens,
            Unit: 'Count',
            Timestamp: timestamp,
            Dimensions: [{ Name: 'Operation', Value: operation }],
          },
        ],
      })
    );
  } catch (error) {
    logger.error('Failed to publish token metrics', { error });
  }
}

/**
 * Publish Bedrock latency metric
 */
export async function publishLatencyMetric(
  latencyMs: number,
  operation: string
): Promise<void> {
  try {
    await cloudwatch.send(
      new PutMetricDataCommand({
        Namespace: NAMESPACE,
        MetricData: [
          {
            MetricName: 'BedrockLatency',
            Value: latencyMs,
            Unit: 'Milliseconds',
            Timestamp: new Date(),
            Dimensions: [{ Name: 'Operation', Value: operation }],
          },
        ],
      })
    );
  } catch (error) {
    logger.error('Failed to publish latency metric', { error });
  }
}

/**
 * Publish agent iteration count
 */
export async function publishAgentIterations(
  iterations: number,
  query: string
): Promise<void> {
  try {
    await cloudwatch.send(
      new PutMetricDataCommand({
        Namespace: NAMESPACE,
        MetricData: [
          {
            MetricName: 'AgentIterations',
            Value: iterations,
            Unit: 'Count',
            Timestamp: new Date(),
            Dimensions: [
              {
                Name: 'QueryType',
                Value: iterations > 1 ? 'MultiHop' : 'SingleHop',
              },
            ],
          },
        ],
      })
    );

    // Log warning if hitting max iterations
    if (iterations >= 3) {
      logger.warn('Agent hit maximum iterations', {
        iterations,
        query: query.slice(0, 100),
      });
    }
  } catch (error) {
    logger.error('Failed to publish agent iterations', { error });
  }
}

/**
 * Publish rate limiting metric
 */
export async function publishRateLimitMetric(
  rejected: boolean,
  type: 'PerIP' | 'Global'
): Promise<void> {
  try {
    await cloudwatch.send(
      new PutMetricDataCommand({
        Namespace: NAMESPACE,
        MetricData: [
          {
            MetricName: rejected ? 'RateLimitRejected' : 'RateLimitAllowed',
            Value: 1,
            Unit: 'Count',
            Timestamp: new Date(),
            Dimensions: [{ Name: 'Type', Value: type }],
          },
        ],
      })
    );
  } catch (error) {
    logger.error('Failed to publish rate limit metric', { error });
  }
}

/**
 * Publish circuit breaker state change
 */
export async function publishCircuitBreakerMetric(
  name: string,
  state: 'open' | 'closed' | 'half-open'
): Promise<void> {
  try {
    await cloudwatch.send(
      new PutMetricDataCommand({
        Namespace: NAMESPACE,
        MetricData: [
          {
            MetricName:
              state === 'open' ? 'CircuitBreakerOpen' : 'CircuitBreakerClosed',
            Value: state === 'open' ? 1 : 0,
            Unit: 'Count',
            Timestamp: new Date(),
            Dimensions: [{ Name: 'Service', Value: name }],
          },
        ],
      })
    );
  } catch (error) {
    logger.error('Failed to publish circuit breaker metric', { error });
  }
}

/**
 * Publish feedback rating metric
 */
export async function publishFeedbackMetric(
  rating: number,
  helpful: boolean,
  accurate: boolean
): Promise<void> {
  try {
    await cloudwatch.send(
      new PutMetricDataCommand({
        Namespace: NAMESPACE,
        MetricData: [
          {
            MetricName: 'FeedbackRating',
            Value: rating,
            Unit: 'Count',
            Timestamp: new Date(),
          },
          {
            MetricName: 'FeedbackAverageRating',
            Value: rating,
            Unit: 'Count',
            Timestamp: new Date(),
          },
          {
            MetricName: 'FeedbackHelpful',
            Value: helpful ? 1 : 0,
            Unit: 'Count',
            Timestamp: new Date(),
          },
          {
            MetricName: 'FeedbackAccurate',
            Value: accurate ? 1 : 0,
            Unit: 'Count',
            Timestamp: new Date(),
          },
        ],
      })
    );
  } catch (error) {
    logger.error('Failed to publish feedback metric', { error });
  }
}

/**
 * Publish citation quality metric
 */
export async function publishCitationMetric(
  citationCount: number,
  hasVerseCitations: boolean
): Promise<void> {
  try {
    await cloudwatch.send(
      new PutMetricDataCommand({
        Namespace: NAMESPACE,
        MetricData: [
          {
            MetricName: 'CitationCount',
            Value: citationCount,
            Unit: 'Count',
            Timestamp: new Date(),
          },
          {
            MetricName: 'HasVerseCitations',
            Value: hasVerseCitations ? 1 : 0,
            Unit: 'Count',
            Timestamp: new Date(),
          },
        ],
      })
    );
  } catch (error) {
    logger.error('Failed to publish citation metric', { error });
  }
}

/**
 * Publish retrieval quality metric
 */
export async function publishRetrievalMetric(
  resultCount: number,
  topScore: number,
  queryType: string
): Promise<void> {
  try {
    await cloudwatch.send(
      new PutMetricDataCommand({
        Namespace: NAMESPACE,
        MetricData: [
          {
            MetricName: 'RetrievalResultCount',
            Value: resultCount,
            Unit: 'Count',
            Timestamp: new Date(),
            Dimensions: [{ Name: 'QueryType', Value: queryType }],
          },
          {
            MetricName: 'RetrievalTopScore',
            Value: topScore * 100, // Convert to percentage
            Unit: 'Percent',
            Timestamp: new Date(),
            Dimensions: [{ Name: 'QueryType', Value: queryType }],
          },
        ],
      })
    );
  } catch (error) {
    logger.error('Failed to publish retrieval metric', { error });
  }
}

/**
 * Batch publish multiple metrics (for efficiency)
 */
export async function publishMetricsBatch(
  metrics: Array<{
    name: string;
    value: number;
    unit: 'Count' | 'Milliseconds' | 'Percent';
    dimensions?: Array<{ Name: string; Value: string }>;
  }>
): Promise<void> {
  if (metrics.length === 0) return;

  // CloudWatch allows max 20 metrics per request
  const batches = [];
  for (let i = 0; i < metrics.length; i += 20) {
    batches.push(metrics.slice(i, i + 20));
  }

  for (const batch of batches) {
    try {
      await cloudwatch.send(
        new PutMetricDataCommand({
          Namespace: NAMESPACE,
          MetricData: batch.map(m => ({
            MetricName: m.name,
            Value: m.value,
            Unit: m.unit,
            Timestamp: new Date(),
            Dimensions: m.dimensions,
          })),
        })
      );
    } catch (error) {
      logger.error('Failed to publish metrics batch', {
        error,
        batchSize: batch.length,
      });
    }
  }
}

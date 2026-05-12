import {
  CloudWatchClient,
  PutMetricDataCommand,
  StandardUnit,
} from '@aws-sdk/client-cloudwatch';
import { getTraceContext } from './tracer';

const NAMESPACE = process.env['CW_METRICS_NAMESPACE'] ?? 'OrderFlow/App';
const SERVICE = process.env['SERVICE_NAME'] ?? 'orderflow';

let cwClient: CloudWatchClient | null = null;

const getClient = (): CloudWatchClient => {
  if (!cwClient) {
    cwClient = new CloudWatchClient({
      region: process.env['AWS_REGION'] ?? 'us-east-1',
    });
  }
  return cwClient;
};

const isTest = (): boolean => process.env['NODE_ENV'] === 'test';

export interface RedMetrics {
  route: string;
  method: string;
  statusCode: number;
  durationMs: number;
}

export const recordRedMetrics = async (m: RedMetrics): Promise<void> => {
  if (isTest()) return;

  const isError = m.statusCode >= 500;
  const dims = [
    { Name: 'Service', Value: SERVICE },
    { Name: 'Route', Value: m.route },
    { Name: 'Method', Value: m.method },
  ];

  try {
    await getClient().send(
      new PutMetricDataCommand({
        Namespace: NAMESPACE,
        MetricData: [
          {
            MetricName: 'RequestCount',
            Dimensions: dims,
            Value: 1,
            Unit: StandardUnit.Count,
          },
          {
            MetricName: 'ErrorCount',
            Dimensions: dims,
            Value: isError ? 1 : 0,
            Unit: StandardUnit.Count,
          },
          {
            MetricName: 'RequestDuration',
            Dimensions: dims,
            Value: m.durationMs,
            Unit: StandardUnit.Milliseconds,
          },
        ],
      })
    );
  } catch {}
};

export interface BusinessMetric {
  name: string;
  value: number;
  unit?: StandardUnit;
  dimensions?: Record<string, string>;
}

export const recordBusinessMetric = async (
  m: BusinessMetric
): Promise<void> => {
  if (isTest()) return;

  const { traceId } = getTraceContext();
  const dims = Object.entries(m.dimensions ?? {}).map(([Name, Value]) => ({
    Name,
    Value,
  }));
  dims.unshift({ Name: 'Service', Value: SERVICE });
  if (traceId) dims.push({ Name: 'TraceId', Value: traceId });

  try {
    await getClient().send(
      new PutMetricDataCommand({
        Namespace: NAMESPACE,
        MetricData: [
          {
            MetricName: m.name,
            Dimensions: dims,
            Value: m.value,
            Unit: m.unit ?? StandardUnit.Count,
          },
        ],
      })
    );
  } catch {}
};

export const recordSqsProcessingMetrics = async (opts: {
  eventType: string;
  durationMs: number;
  success: boolean;
}): Promise<void> => {
  if (isTest()) return;

  const dims = [
    { Name: 'Service', Value: SERVICE },
    { Name: 'EventType', Value: opts.eventType },
  ];

  try {
    await getClient().send(
      new PutMetricDataCommand({
        Namespace: NAMESPACE,
        MetricData: [
          {
            MetricName: 'SQSMessageProcessed',
            Dimensions: dims,
            Value: 1,
            Unit: StandardUnit.Count,
          },
          {
            MetricName: 'SQSProcessingError',
            Dimensions: dims,
            Value: opts.success ? 0 : 1,
            Unit: StandardUnit.Count,
          },
          {
            MetricName: 'SQSProcessingDuration',
            Dimensions: dims,
            Value: opts.durationMs,
            Unit: StandardUnit.Milliseconds,
          },
        ],
      })
    );
  } catch {}
};

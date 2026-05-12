import { NodeSDK, tracing, resources } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import {
  SEMRESATTRS_SERVICE_NAME,
  SEMRESATTRS_SERVICE_VERSION,
  SEMRESATTRS_DEPLOYMENT_ENVIRONMENT,
} from '@opentelemetry/semantic-conventions';
import {
  context,
  trace,
  Span,
  SpanStatusCode,
  SpanKind,
} from '@opentelemetry/api';

const {
  SimpleSpanProcessor,
  BatchSpanProcessor,
  ConsoleSpanExporter,
  TraceIdRatioBasedSampler,
  ParentBasedSampler,
} = tracing;

const { Resource } = resources;

export { context, trace, SpanStatusCode, SpanKind };
export type { Span };

let sdk: NodeSDK | null = null;

export const initTracing = (serviceName: string): void => {
  const isTest = process.env['NODE_ENV'] === 'test';
  if (isTest) return;

  const samplingRatio = parseFloat(
    process.env['OTEL_SAMPLING_RATIO'] ?? '0.05'
  );

  const resource = new Resource({
    [SEMRESATTRS_SERVICE_NAME]: serviceName,
    [SEMRESATTRS_SERVICE_VERSION]:
      process.env['npm_package_version'] ?? '0.0.0',
    [SEMRESATTRS_DEPLOYMENT_ENVIRONMENT]:
      process.env['NODE_ENV'] ?? 'development',
  });

  const sampler = new ParentBasedSampler({
    root: new TraceIdRatioBasedSampler(samplingRatio),
  });

  const exporters = [];

  if (process.env['OTEL_EXPORTER_OTLP_ENDPOINT']) {
    exporters.push(
      new BatchSpanProcessor(
        new OTLPTraceExporter({
          url: process.env['OTEL_EXPORTER_OTLP_ENDPOINT'] + '/v1/traces',
        })
      )
    );
  } else {
    exporters.push(new SimpleSpanProcessor(new ConsoleSpanExporter()));
  }

  sdk = new NodeSDK({
    resource,
    sampler,
    spanProcessors: exporters,
    instrumentations: [
      getNodeAutoInstrumentations({
        '@opentelemetry/instrumentation-fs': { enabled: false },
        '@opentelemetry/instrumentation-http': { enabled: true },
        '@opentelemetry/instrumentation-express': { enabled: true },
        '@opentelemetry/instrumentation-pg': { enabled: true },
      }),
    ],
  });

  sdk.start();

  process.on('SIGTERM', async () => {
    try {
      await sdk?.shutdown();
    } catch {}
  });
};

export const getActiveSpan = (): Span | undefined => trace.getActiveSpan();

export const getTraceContext = (): {
  traceId?: string;
  spanId?: string;
} => {
  const span = trace.getActiveSpan();
  if (!span) return {};
  const ctx = span.spanContext();
  return { traceId: ctx.traceId, spanId: ctx.spanId };
};

export const withSpan = async <T>(
  tracer: ReturnType<typeof trace.getTracer>,
  name: string,
  fn: (span: Span) => Promise<T>,
  attrs?: Record<string, string | number | boolean>
): Promise<T> => {
  return tracer.startActiveSpan(name, async (span: Span) => {
    if (attrs) {
      Object.entries(attrs).forEach(([k, v]) => span.setAttribute(k, v));
    }
    try {
      const result = await fn(span);
      span.setStatus({ code: SpanStatusCode.OK });
      return result;
    } catch (err) {
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: err instanceof Error ? err.message : String(err),
      });
      span.recordException(err as Error);
      throw err;
    } finally {
      span.end();
    }
  });
};

import { startSqsConsumer } from './sqs.consumer';

jest.mock('@aws-sdk/client-sqs', () => ({
  SQSClient: jest.fn().mockImplementation(() => ({
    send: jest.fn().mockResolvedValue({ Messages: [] }),
  })),
  ReceiveMessageCommand: jest.fn(),
  DeleteMessageCommand: jest.fn(),
}));

jest.mock('../ws/ws.server', () => ({ pushToUser: jest.fn() }));

jest.mock('@orderflow/event-schemas', () => ({
  validateEvent: jest.fn().mockReturnValue({ success: true, data: {} }),
}));

jest.mock('@orderflow/logger', () => ({
  createLogger: jest.fn().mockReturnValue({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  }),
  otelTrace: {
    getTracer: jest.fn().mockReturnValue({
      startActiveSpan: jest.fn((_name: string, fn: (s: unknown) => unknown) =>
        fn({
          setAttribute: jest.fn(),
          setStatus: jest.fn(),
          recordException: jest.fn(),
          end: jest.fn(),
        })
      ),
    }),
  },
  withSpan: jest.fn(
    async (
      _tracer: unknown,
      _name: string,
      fn: (span: unknown) => Promise<unknown>
    ) =>
      fn({
        setAttribute: jest.fn(),
        setStatus: jest.fn(),
        recordException: jest.fn(),
        end: jest.fn(),
      })
  ),
  recordSqsProcessingMetrics: jest.fn().mockResolvedValue(undefined),
}));

describe('startSqsConsumer', () => {
  it('starts and returns a stop function', () => {
    const consumer = startSqsConsumer();
    expect(consumer).toHaveProperty('stop');
    expect(typeof consumer.stop).toBe('function');
    consumer.stop();
  });
});

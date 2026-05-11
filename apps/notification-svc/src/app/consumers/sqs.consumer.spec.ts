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
}));

describe('startSqsConsumer', () => {
  it('starts and returns a stop function', () => {
    const consumer = startSqsConsumer();
    expect(consumer).toHaveProperty('stop');
    expect(typeof consumer.stop).toBe('function');
    consumer.stop();
  });
});

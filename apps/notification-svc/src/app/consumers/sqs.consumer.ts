import {
  SQSClient,
  ReceiveMessageCommand,
  DeleteMessageCommand,
  Message,
} from '@aws-sdk/client-sqs';
import { createLogger } from '@orderflow/logger';
import { validateEvent, EventTypeName } from '@orderflow/event-schemas';
import { pushToUser } from '../ws/ws.server';

const log = createLogger('notification-svc:sqs');

const QUEUE_URL = process.env['SQS_QUEUE_URL'] ?? '';
const MAX_MESSAGES = 10;
const WAIT_TIME = 20;
const MAX_RETRIES = 3;

const sqsClient = new SQSClient({
  region: process.env['AWS_REGION'] ?? 'us-east-1',
  ...(process.env['LOCALSTACK_ENDPOINT']
    ? { endpoint: process.env['LOCALSTACK_ENDPOINT'] }
    : {}),
});

const processedIds = new Set<string>();

const handleMessage = async (message: Message): Promise<void> => {
  if (!message.Body || !message.MessageId) return;

  if (processedIds.has(message.MessageId)) {
    log.warn('Duplicate message skipped', { messageId: message.MessageId });
    return;
  }

  let envelope: { type?: string; data?: unknown; correlationId?: string };
  try {
    envelope = JSON.parse(message.Body) as typeof envelope;
  } catch {
    log.error('Failed to parse SQS message body', {
      messageId: message.MessageId,
    });
    return;
  }

  const eventType = envelope.type as EventTypeName;
  const validation = validateEvent(eventType, envelope);
  if (!validation.success) {
    log.warn('Invalid event schema', {
      eventType,
      messageId: message.MessageId,
    });
    return;
  }

  const data = envelope.data as Record<string, unknown>;
  const userId = data['userId'] as string | undefined;

  if (userId) {
    pushToUser(userId, eventType, data);
    log.info('Notification pushed', {
      userId,
      eventType,
      correlationId: envelope.correlationId,
    });
  }

  processedIds.add(message.MessageId);
  if (processedIds.size > 10000) {
    const first = processedIds.values().next().value;
    if (first) processedIds.delete(first);
  }
};

const poll = async (running: { value: boolean }): Promise<void> => {
  while (running.value) {
    try {
      const response = await sqsClient.send(
        new ReceiveMessageCommand({
          QueueUrl: QUEUE_URL,
          MaxNumberOfMessages: MAX_MESSAGES,
          WaitTimeSeconds: WAIT_TIME,
          MessageSystemAttributeNames: ['ApproximateReceiveCount'],
        })
      );

      const messages = response.Messages ?? [];

      await Promise.all(
        messages.map(async msg => {
          const receiveCount = parseInt(
            msg.Attributes?.['ApproximateReceiveCount'] ?? '0',
            10
          );

          if (receiveCount > MAX_RETRIES) {
            log.error(
              'Message exceeded max retries — moving to DLQ passthrough',
              {
                messageId: msg.MessageId,
              }
            );
            return;
          }

          try {
            await handleMessage(msg);
            await sqsClient.send(
              new DeleteMessageCommand({
                QueueUrl: QUEUE_URL,
                ReceiptHandle: msg.ReceiptHandle!,
              })
            );
          } catch (err) {
            log.error('Failed to process message', {
              messageId: msg.MessageId,
              err,
            });
          }
        })
      );
    } catch (err) {
      log.error('SQS poll error', { err });
      await new Promise(r => setTimeout(r, 5000));
    }
  }
};

export const startSqsConsumer = (): { stop: () => void } => {
  const running = { value: true };
  poll(running).catch(err => log.error('SQS consumer crashed', { err }));
  log.info('SQS consumer started', { queueUrl: QUEUE_URL });
  return {
    stop: () => {
      running.value = false;
      log.info('SQS consumer stopping');
    },
  };
};

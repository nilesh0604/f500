import {
  SQSClient,
  ReceiveMessageCommand,
  DeleteMessageCommand,
  Message,
} from '@aws-sdk/client-sqs';
import {
  createLogger,
  recordSqsProcessingMetrics,
  withSpan,
  otelTrace,
} from '@orderflow/logger';
import { validateEvent, EventTypeName } from '@orderflow/event-schemas';
import { pushToUser } from '../ws/ws.server';

const log = createLogger('notification-svc:sqs');
const tracer = otelTrace.getTracer('notification-svc');

const QUEUE_URL = process.env['SQS_QUEUE_URL'] ?? '';
const MAX_MESSAGES = 10;
const WAIT_TIME = 20;
const MAX_RETRIES = 3;
const MESSAGE_TIMEOUT_MS = 5000;

const sqsClient = new SQSClient({
  region: process.env['AWS_REGION'] ?? 'us-east-1',
  ...(process.env['LOCALSTACK_ENDPOINT']
    ? {
        endpoint: process.env['LOCALSTACK_ENDPOINT'],
        credentials: {
          accessKeyId: process.env['AWS_ACCESS_KEY_ID'] ?? 'test',
          secretAccessKey: process.env['AWS_SECRET_ACCESS_KEY'] ?? 'test',
        },
      }
    : {}),
});

const processedIds = new Set<string>();

const handleMessage = async (message: Message): Promise<void> => {
  if (!message.Body || !message.MessageId) return;

  if (processedIds.has(message.MessageId)) {
    log.warn('Duplicate message skipped', { messageId: message.MessageId });
    return;
  }

  let rawBody: unknown;
  try {
    rawBody = JSON.parse(message.Body);
  } catch {
    log.error('Failed to parse SQS message body', {
      messageId: message.MessageId,
    });
    return;
  }

  const eventBridgeWrapper = rawBody as {
    detail?: { type?: string; data?: unknown; correlationId?: string };
  };
  const envelope =
    eventBridgeWrapper.detail ??
    (rawBody as { type?: string; data?: unknown; correlationId?: string });

  if (!envelope.type) {
    log.warn('Message missing event type', { messageId: message.MessageId });
    return;
  }

  const eventType = envelope.type as EventTypeName;

  await withSpan(
    tracer,
    `sqs.process.${eventType}`,
    async span => {
      const start = Date.now();
      span.setAttribute('messaging.system', 'aws_sqs');
      span.setAttribute('messaging.operation', 'process');
      span.setAttribute('messaging.message_id', message.MessageId ?? '');
      span.setAttribute('event.type', eventType);
      if (envelope.correlationId) {
        span.setAttribute('correlation.id', envelope.correlationId);
      }

      const validation = validateEvent(eventType, envelope);
      if (!validation.success) {
        log.warn('Invalid event schema', {
          eventType,
          messageId: message.MessageId,
          errors: validation.errors,
        });
        await recordSqsProcessingMetrics({
          eventType,
          durationMs: Date.now() - start,
          success: false,
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

      await recordSqsProcessingMetrics({
        eventType,
        durationMs: Date.now() - start,
        success: true,
      });

      processedIds.add(message.MessageId!);
      if (processedIds.size > 10000) {
        const first = processedIds.values().next().value;
        if (first) processedIds.delete(first);
      }
    },
    { 'messaging.message_id': message.MessageId ?? '' }
  );
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
            await Promise.race([
              handleMessage(msg),
              new Promise<never>((_, reject) =>
                setTimeout(
                  () =>
                    reject(
                      new Error(
                        `Message processing timeout after ${MESSAGE_TIMEOUT_MS}ms`
                      )
                    ),
                  MESSAGE_TIMEOUT_MS
                )
              ),
            ]);
            await sqsClient.send(
              new DeleteMessageCommand({
                QueueUrl: QUEUE_URL,
                ReceiptHandle: msg.ReceiptHandle!,
              })
            );
          } catch (err) {
            const isTimeout = (err as Error).message?.includes('timeout');
            if (isTimeout) {
              log.warn('Message processing timed out — degraded delete', {
                messageId: msg.MessageId,
              });
              await sqsClient
                .send(
                  new DeleteMessageCommand({
                    QueueUrl: QUEUE_URL,
                    ReceiptHandle: msg.ReceiptHandle!,
                  })
                )
                .catch(() => undefined);
            } else {
              log.error('Failed to process message', {
                messageId: msg.MessageId,
                err,
              });
            }
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

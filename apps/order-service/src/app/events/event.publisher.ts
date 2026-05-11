import {
  EventBridgeClient,
  PutEventsCommand,
} from '@aws-sdk/client-eventbridge';
import { buildEventEnvelope } from '@orderflow/event-schemas';
import { createLogger } from '@orderflow/logger';

const log = createLogger('order-service:events');

const client = new EventBridgeClient({
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

const EVENT_BUS = process.env['EVENT_BUS_NAME'] ?? 'orderflow-event-bus';

export const publishEvent = async <T>(
  type: string,
  data: T,
  correlationId?: string
): Promise<void> => {
  const envelope = buildEventEnvelope(type, data, correlationId);

  if (process.env['NODE_ENV'] === 'test') {
    log.debug('Skipping EventBridge publish in test mode', { type });
    return;
  }

  try {
    await client.send(
      new PutEventsCommand({
        Entries: [
          {
            EventBusName: EVENT_BUS,
            Source: envelope.source,
            DetailType: type,
            Detail: JSON.stringify(envelope),
          },
        ],
      })
    );
    log.info('Event published', {
      type,
      correlationId: envelope.correlationId,
    });
  } catch (err) {
    log.error('Failed to publish event', { type, err });
    throw err;
  }
};

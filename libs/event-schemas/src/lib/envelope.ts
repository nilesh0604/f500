import { v4 as uuidv4 } from 'uuid';
import { EventEnvelope } from '@orderflow/shared-types';

export const buildEventEnvelope = <T>(
  type: string,
  data: T,
  correlationId?: string
): EventEnvelope<T> => ({
  source: 'orderflow.order-service',
  type,
  correlationId: correlationId ?? uuidv4(),
  timestamp: new Date().toISOString(),
  version: '1.0.0',
  data,
});

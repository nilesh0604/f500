import { z } from 'zod';
import { orderCreatedSchema, orderStatusChangedSchema } from './schemas';

const schemaMap = {
  OrderCreated: orderCreatedSchema,
  OrderStatusChanged: orderStatusChangedSchema,
} as const;

export type EventTypeName = keyof typeof schemaMap;

export const validateEvent = (
  eventType: EventTypeName,
  payload: unknown
):
  | { success: true; data: unknown }
  | { success: false; errors: z.ZodIssue[] } => {
  const schema = schemaMap[eventType];
  const result = schema.safeParse(payload);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return { success: false, errors: result.error.issues };
};

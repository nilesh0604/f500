import { z } from 'zod';

const orderStatusSchema = z.enum([
  'pending',
  'confirmed',
  'shipped',
  'delivered',
  'cancelled',
]);

export const eventEnvelopeSchema = z.object({
  source: z.string().min(1),
  type: z.string().min(1),
  correlationId: z.string().uuid(),
  timestamp: z.string().datetime(),
  version: z.string().min(1),
  data: z.unknown(),
});

export const orderCreatedSchema = eventEnvelopeSchema.extend({
  type: z.literal('OrderCreated'),
  data: z.object({
    orderId: z.string().uuid(),
    userId: z.string().uuid(),
    itemName: z.string().min(1),
    quantity: z.number().int().positive(),
    notes: z.string().nullable(),
    status: z.literal('pending'),
    createdAt: z.string().datetime(),
  }),
});

export const orderStatusChangedSchema = eventEnvelopeSchema.extend({
  type: z.literal('OrderStatusChanged'),
  data: z.object({
    orderId: z.string().uuid(),
    userId: z.string().uuid(),
    fromStatus: orderStatusSchema,
    toStatus: orderStatusSchema,
    changedAt: z.string().datetime(),
  }),
});

export type OrderCreatedEvent = z.infer<typeof orderCreatedSchema>;
export type OrderStatusChangedEvent = z.infer<typeof orderStatusChangedSchema>;

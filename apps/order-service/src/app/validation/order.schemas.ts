import { z } from 'zod';

const orderStatusSchema = z.enum([
  'pending',
  'confirmed',
  'shipped',
  'delivered',
  'cancelled',
]);

export const createOrderSchema = z.object({
  itemName: z.string().min(1).max(255),
  quantity: z.number().int().min(1).max(9999),
  notes: z.string().max(1000).optional(),
  idempotencyKey: z.string().uuid().optional(),
});

export const updateOrderStatusSchema = z.object({
  status: orderStatusSchema,
});

export const listOrdersQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: orderStatusSchema.optional(),
});

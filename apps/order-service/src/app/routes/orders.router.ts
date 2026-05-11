import { Router, Request, Response } from 'express';
import { authenticate, AuthRequest } from '@orderflow/auth';
import {
  createOrderSchema,
  updateOrderStatusSchema,
  listOrdersQuerySchema,
} from '../validation/order.schemas';
import {
  createOrder,
  listOrders,
  getOrder,
  updateOrderStatus,
} from '../services/order.service';
import { OrderStatus } from '@orderflow/shared-types';

export const ordersRouter = Router();

ordersRouter.use(authenticate);

ordersRouter.post('/', async (req: Request, res: Response) => {
  const result = createOrderSchema.safeParse(req.body);
  if (!result.success) {
    res.status(422).json({
      error: 'Validation Error',
      message: 'Invalid request body',
      details: result.error.issues,
    });
    return;
  }

  const idempotencyKey =
    (req.headers['idempotency-key'] as string) || result.data.idempotencyKey;

  try {
    const order = await createOrder((req as AuthRequest).userId, {
      ...result.data,
      idempotencyKey,
    });
    res.status(201).json(order);
  } catch (err) {
    const e = err as Error & { status?: number };
    res.status(e.status ?? 500).json({ error: e.message, message: e.message });
  }
});

ordersRouter.get('/', async (req: Request, res: Response) => {
  const result = listOrdersQuerySchema.safeParse(req.query);
  if (!result.success) {
    res
      .status(422)
      .json({ error: 'Validation Error', message: 'Invalid query params' });
    return;
  }

  const { cursor, limit, status } = result.data;
  const data = await listOrders(
    (req as AuthRequest).userId,
    cursor,
    limit,
    status as OrderStatus | undefined
  );
  res.status(200).json(data);
});

ordersRouter.get('/:id', async (req: Request, res: Response) => {
  const order = await getOrder(req.params['id'], (req as AuthRequest).userId);
  if (!order) {
    res.status(404).json({ error: 'Not Found', message: 'Order not found' });
    return;
  }
  res.status(200).json(order);
});

ordersRouter.patch('/:id/status', async (req: Request, res: Response) => {
  const result = updateOrderStatusSchema.safeParse(req.body);
  if (!result.success) {
    res.status(422).json({
      error: 'Validation Error',
      message: 'Invalid status',
      details: result.error.issues,
    });
    return;
  }

  try {
    const order = await updateOrderStatus(
      req.params['id'],
      (req as AuthRequest).userId,
      result.data
    );
    res.status(200).json(order);
  } catch (err) {
    const e = err as Error & { status?: number };
    res.status(e.status ?? 500).json({ error: e.message, message: e.message });
  }
});

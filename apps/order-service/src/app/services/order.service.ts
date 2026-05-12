import { prisma } from '../db/prisma.client';
import { publishEvent } from '../events/event.publisher';
import { invalidateOrdersCache } from '../middleware/cache.middleware';
import {
  createLogger,
  recordBusinessMetric,
  withSpan,
  otelTrace,
} from '@orderflow/logger';
import {
  Order,
  CreateOrderDto,
  UpdateOrderStatusDto,
  OrderStatus,
  ORDER_STATUS_TRANSITIONS,
} from '@orderflow/shared-types';
import { PaginatedResponse } from '@orderflow/shared-types';
import { EVENT_TYPES } from '@orderflow/shared-types';

const log = createLogger('order-service:orders');
const tracer = otelTrace.getTracer('order-service');

const toOrder = (raw: {
  id: string;
  userId: string;
  itemName: string;
  quantity: number;
  notes: string | null;
  status: OrderStatus;
  idempotencyKey: string | null;
  createdAt: Date;
  updatedAt: Date;
}): Order => raw;

export const createOrder = async (
  userId: string,
  dto: CreateOrderDto
): Promise<Order> =>
  withSpan(tracer, 'order.create', async span => {
    span.setAttribute('order.userId', userId);
    span.setAttribute('order.itemName', dto.itemName);
    span.setAttribute('order.quantity', dto.quantity);

    if (dto.idempotencyKey) {
      const existing = await prisma.order.findUnique({
        where: { idempotencyKey: dto.idempotencyKey },
      });
      if (existing) {
        span.setAttribute('order.idempotent', true);
        return toOrder(existing as Parameters<typeof toOrder>[0]);
      }
    }

    const order = await prisma.order.create({
      data: {
        userId,
        itemName: dto.itemName,
        quantity: dto.quantity,
        notes: dto.notes ?? null,
        idempotencyKey: dto.idempotencyKey ?? null,
      },
    });

    await prisma.orderAudit.create({
      data: {
        orderId: order.id,
        userId,
        action: 'created',
        toStatus: 'pending',
      },
    });

    await publishEvent(EVENT_TYPES.ORDER_CREATED, {
      orderId: order.id,
      userId,
      itemName: order.itemName,
      quantity: order.quantity,
      notes: order.notes,
      status: 'pending' as const,
      createdAt: order.createdAt.toISOString(),
    });

    await recordBusinessMetric({
      name: 'OrdersCreated',
      value: 1,
      dimensions: { ItemName: order.itemName },
    });

    await invalidateOrdersCache(userId);
    span.setAttribute('order.id', order.id);
    log.info('Order created', { orderId: order.id, userId });
    return toOrder(order as Parameters<typeof toOrder>[0]);
  });

export const listOrders = async (
  userId: string,
  cursor?: string,
  limit = 20,
  status?: OrderStatus
): Promise<PaginatedResponse<Order>> => {
  const take = Math.min(limit, 100) + 1;

  const orders = await prisma.order.findMany({
    where: { userId, ...(status ? { status } : {}) },
    take,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    orderBy: { createdAt: 'desc' },
  });

  const hasNextPage = orders.length === take;
  const data = hasNextPage ? orders.slice(0, -1) : orders;

  return {
    data: (data as Parameters<typeof toOrder>[0][]).map(toOrder),
    pagination: {
      hasNextPage,
      nextCursor: hasNextPage ? data[data.length - 1].id : null,
    },
  };
};

export const getOrder = async (
  id: string,
  userId: string
): Promise<Order | null> => {
  const order = await prisma.order.findUnique({ where: { id } });
  if (!order || order.userId !== userId) return null;
  return toOrder(order as Parameters<typeof toOrder>[0]);
};

export const updateOrderStatus = async (
  id: string,
  userId: string,
  dto: UpdateOrderStatusDto
): Promise<Order> =>
  withSpan(tracer, 'order.updateStatus', async span => {
    span.setAttribute('order.id', id);
    span.setAttribute('order.userId', userId);
    span.setAttribute('order.targetStatus', dto.status);

    const order = await prisma.order.findUnique({ where: { id } });

    if (!order || order.userId !== userId) {
      const err = new Error('Order not found');
      (err as Error & { status: number }).status = 404;
      throw err;
    }

    const validTransitions =
      ORDER_STATUS_TRANSITIONS[order.status as OrderStatus];
    if (!validTransitions.includes(dto.status)) {
      const err = new Error(
        `Invalid transition: ${order.status} → ${dto.status}`
      );
      (err as Error & { status: number }).status = 400;
      throw err;
    }

    const updated = await prisma.order.update({
      where: { id },
      data: { status: dto.status },
    });

    await prisma.orderAudit.create({
      data: {
        orderId: id,
        userId,
        action: 'status_changed',
        fromStatus: order.status,
        toStatus: dto.status,
      },
    });

    await publishEvent(EVENT_TYPES.ORDER_STATUS_CHANGED, {
      orderId: id,
      userId,
      fromStatus: order.status as OrderStatus,
      toStatus: dto.status,
      changedAt: new Date().toISOString(),
    });

    await recordBusinessMetric({
      name: 'OrderStatusChanges',
      value: 1,
      dimensions: {
        FromStatus: order.status,
        ToStatus: dto.status,
      },
    });

    await invalidateOrdersCache(userId);
    span.setAttribute('order.fromStatus', order.status);
    log.info('Order status updated', {
      orderId: id,
      from: order.status,
      to: dto.status,
    });
    return toOrder(updated as Parameters<typeof toOrder>[0]);
  });

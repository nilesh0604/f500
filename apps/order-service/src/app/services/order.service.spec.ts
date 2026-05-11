import {
  createOrder,
  listOrders,
  getOrder,
  updateOrderStatus,
} from './order.service';
import { buildOrder } from '@orderflow/testing-utils';

jest.mock('../db/prisma.client', () => ({
  prisma: {
    order: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      findMany: jest.fn(),
    },
    orderAudit: { create: jest.fn() },
    user: { findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
    $queryRaw: jest.fn(),
    $connect: jest.fn(),
    $disconnect: jest.fn(),
  },
}));
jest.mock('../events/event.publisher', () => ({ publishEvent: jest.fn() }));

const { prisma: mockPrisma } = jest.requireMock('../db/prisma.client') as {
  prisma: {
    order: {
      findUnique: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      updateMany: jest.Mock;
      findMany: jest.Mock;
    };
    orderAudit: { create: jest.Mock };
    user: { findUnique: jest.Mock; create: jest.Mock; update: jest.Mock };
    $queryRaw: jest.Mock;
    $connect: jest.Mock;
    $disconnect: jest.Mock;
  };
};

describe('order.service', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('createOrder', () => {
    it('creates an order and returns it', async () => {
      const order = buildOrder({ userId: 'user-1' });
      mockPrisma.order.findUnique.mockResolvedValue(null);
      mockPrisma.order.create.mockResolvedValue(order);
      mockPrisma.orderAudit.create.mockResolvedValue({});

      const result = await createOrder('user-1', {
        itemName: 'Widget',
        quantity: 2,
      });

      expect(result.id).toBe(order.id);
      expect(mockPrisma.order.create).toHaveBeenCalledTimes(1);
      expect(mockPrisma.orderAudit.create).toHaveBeenCalledTimes(1);
    });

    it('returns existing order when idempotency key matches', async () => {
      const order = buildOrder({ idempotencyKey: 'idem-123' });
      mockPrisma.order.findUnique.mockResolvedValue(order);

      const result = await createOrder('user-1', {
        itemName: 'Widget',
        quantity: 1,
        idempotencyKey: 'idem-123',
      });

      expect(result.id).toBe(order.id);
      expect(mockPrisma.order.create).not.toHaveBeenCalled();
    });
  });

  describe('updateOrderStatus', () => {
    it('throws 404 when order not found', async () => {
      mockPrisma.order.findUnique.mockResolvedValue(null);

      await expect(
        updateOrderStatus('non-existent', 'user-1', { status: 'confirmed' })
      ).rejects.toMatchObject({ message: 'Order not found' });
    });

    it('throws 400 for invalid transition', async () => {
      const order = buildOrder({ status: 'delivered', userId: 'user-1' });
      mockPrisma.order.findUnique.mockResolvedValue(order);

      await expect(
        updateOrderStatus(order.id, 'user-1', { status: 'cancelled' })
      ).rejects.toMatchObject({
        message: expect.stringContaining('Invalid transition'),
      });
    });

    it('updates status for valid transition', async () => {
      const order = buildOrder({ status: 'pending', userId: 'user-1' });
      const updated = { ...order, status: 'confirmed' as const };
      mockPrisma.order.findUnique.mockResolvedValue(order);
      mockPrisma.order.update.mockResolvedValue(updated);
      mockPrisma.orderAudit.create.mockResolvedValue({});

      const result = await updateOrderStatus(order.id, 'user-1', {
        status: 'confirmed',
      });

      expect(result.status).toBe('confirmed');
    });
  });

  describe('getOrder', () => {
    it('returns null for wrong userId', async () => {
      const order = buildOrder({ userId: 'user-1' });
      mockPrisma.order.findUnique.mockResolvedValue(order);

      const result = await getOrder(order.id, 'user-2');

      expect(result).toBeNull();
    });
  });

  describe('listOrders', () => {
    it('returns paginated orders', async () => {
      const orders = [buildOrder(), buildOrder()];
      mockPrisma.order.findMany.mockResolvedValue(orders);

      const result = await listOrders('user-1', undefined, 20);

      expect(result.data).toHaveLength(2);
      expect(result.pagination.hasNextPage).toBe(false);
    });
  });
});

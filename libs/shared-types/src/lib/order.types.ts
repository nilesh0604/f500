export type OrderStatus =
  | 'pending'
  | 'confirmed'
  | 'shipped'
  | 'delivered'
  | 'cancelled';

export const ORDER_STATUS_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  pending: ['confirmed', 'cancelled'],
  confirmed: ['shipped', 'cancelled'],
  shipped: ['delivered'],
  delivered: [],
  cancelled: [],
};

export interface Order {
  id: string;
  userId: string;
  itemName: string;
  quantity: number;
  notes: string | null;
  status: OrderStatus;
  idempotencyKey: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateOrderDto {
  itemName: string;
  quantity: number;
  notes?: string;
  idempotencyKey?: string;
}

export interface UpdateOrderStatusDto {
  status: OrderStatus;
}

export interface OrderAuditEntry {
  id: string;
  orderId: string;
  userId: string;
  action: string;
  fromStatus: OrderStatus | null;
  toStatus: OrderStatus;
  timestamp: Date;
}

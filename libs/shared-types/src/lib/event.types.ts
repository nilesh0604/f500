import { OrderStatus } from './order.types';

export interface EventEnvelope<T = unknown> {
  source: string;
  type: string;
  correlationId: string;
  timestamp: string;
  version: string;
  data: T;
}

export interface OrderCreatedEvent {
  orderId: string;
  userId: string;
  itemName: string;
  quantity: number;
  notes: string | null;
  status: 'pending';
  createdAt: string;
}

export interface OrderStatusChangedEvent {
  orderId: string;
  userId: string;
  fromStatus: OrderStatus;
  toStatus: OrderStatus;
  changedAt: string;
}

export type OrderEvent =
  | EventEnvelope<OrderCreatedEvent>
  | EventEnvelope<OrderStatusChangedEvent>;

export const EVENT_TYPES = {
  ORDER_CREATED: 'OrderCreated',
  ORDER_STATUS_CHANGED: 'OrderStatusChanged',
} as const;

export type EventType = (typeof EVENT_TYPES)[keyof typeof EVENT_TYPES];

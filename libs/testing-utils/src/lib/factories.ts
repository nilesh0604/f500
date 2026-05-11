import { v4 as uuidv4 } from 'uuid';
import { Order, User, CreateOrderDto } from '@orderflow/shared-types';

export const buildOrder = (overrides: Partial<Order> = {}): Order => ({
  id: uuidv4(),
  userId: uuidv4(),
  itemName: 'Test Item',
  quantity: 2,
  notes: null,
  status: 'pending',
  idempotencyKey: null,
  createdAt: new Date('2024-01-01T00:00:00Z'),
  updatedAt: new Date('2024-01-01T00:00:00Z'),
  ...overrides,
});

export const buildUser = (overrides: Partial<User> = {}): User => ({
  id: uuidv4(),
  emailHash: 'hashed@example.com',
  passwordHash: '$2b$12$hashedpassword',
  consentTimestamp: new Date('2024-01-01T00:00:00Z'),
  createdAt: new Date('2024-01-01T00:00:00Z'),
  updatedAt: new Date('2024-01-01T00:00:00Z'),
  deletedAt: null,
  ...overrides,
});

export const buildCreateOrderDto = (
  overrides: Partial<CreateOrderDto> = {}
): CreateOrderDto => ({
  itemName: 'Test Item',
  quantity: 1,
  notes: 'Test notes',
  ...overrides,
});

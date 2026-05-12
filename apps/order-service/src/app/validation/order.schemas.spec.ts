import {
  createOrderSchema,
  updateOrderStatusSchema,
  listOrdersQuerySchema,
  orderIdParamSchema,
} from './order.schemas';

describe('createOrderSchema', () => {
  it('accepts valid input and trims whitespace', () => {
    const result = createOrderSchema.safeParse({
      itemName: '  Widget  ',
      quantity: 3,
      notes: '  fragile  ',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.itemName).toBe('Widget');
      expect(result.data.notes).toBe('fragile');
    }
  });

  it('rejects empty itemName', () => {
    const result = createOrderSchema.safeParse({ itemName: '', quantity: 1 });
    expect(result.success).toBe(false);
  });

  it('rejects quantity of 0', () => {
    const result = createOrderSchema.safeParse({
      itemName: 'Widget',
      quantity: 0,
    });
    expect(result.success).toBe(false);
  });

  it('rejects quantity exceeding 9999', () => {
    const result = createOrderSchema.safeParse({
      itemName: 'Widget',
      quantity: 10000,
    });
    expect(result.success).toBe(false);
  });

  it('rejects non-uuid idempotencyKey', () => {
    const result = createOrderSchema.safeParse({
      itemName: 'Widget',
      quantity: 1,
      idempotencyKey: 'not-a-uuid',
    });
    expect(result.success).toBe(false);
  });

  it('rejects notes longer than 1000 chars', () => {
    const result = createOrderSchema.safeParse({
      itemName: 'Widget',
      quantity: 1,
      notes: 'x'.repeat(1001),
    });
    expect(result.success).toBe(false);
  });
});

describe('updateOrderStatusSchema', () => {
  it('accepts valid statuses', () => {
    const statuses = [
      'pending',
      'confirmed',
      'shipped',
      'delivered',
      'cancelled',
    ];
    statuses.forEach(status => {
      expect(updateOrderStatusSchema.safeParse({ status }).success).toBe(true);
    });
  });

  it('rejects arbitrary string as status', () => {
    const result = updateOrderStatusSchema.safeParse({
      status: 'hacked',
    });
    expect(result.success).toBe(false);
  });
});

describe('listOrdersQuerySchema', () => {
  it('uses default limit of 20', () => {
    const result = listOrdersQuerySchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.limit).toBe(20);
  });

  it('rejects limit > 100', () => {
    const result = listOrdersQuerySchema.safeParse({ limit: 101 });
    expect(result.success).toBe(false);
  });

  it('rejects non-UUID cursor', () => {
    const result = listOrdersQuerySchema.safeParse({
      cursor: 'not-a-uuid',
    });
    expect(result.success).toBe(false);
  });
});

describe('orderIdParamSchema', () => {
  it('accepts a valid UUID', () => {
    const result = orderIdParamSchema.safeParse({
      id: '550e8400-e29b-41d4-a716-446655440000',
    });
    expect(result.success).toBe(true);
  });

  it('rejects path-traversal-style input', () => {
    const result = orderIdParamSchema.safeParse({
      id: '../../etc/passwd',
    });
    expect(result.success).toBe(false);
  });

  it('rejects SQL injection attempt', () => {
    const result = orderIdParamSchema.safeParse({
      id: "1'; DROP TABLE orders;--",
    });
    expect(result.success).toBe(false);
  });
});

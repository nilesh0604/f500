export const MOCK_TOKEN =
  'eyJhbGciOiJSUzI1NiJ9.eyJzdWIiOiJ1c2VyLTEiLCJleHAiOjk5OTk5OTk5OTl9.sig';

export const mockOrders = [
  {
    id: 'order-1',
    userId: 'user-1',
    itemName: 'Laptop Stand',
    quantity: 2,
    notes: null as null,
    status: 'pending',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'order-2',
    userId: 'user-1',
    itemName: 'Keyboard',
    quantity: 1,
    notes: 'Mechanical preferred',
    status: 'confirmed',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
];

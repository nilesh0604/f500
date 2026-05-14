import { TestBed } from '@angular/core/testing';
import {
  HttpClientTestingModule,
  HttpTestingController,
} from '@angular/common/http/testing';

import { OrderService, Order, OrderListResponse } from './order.service';

const mockOrder: Order = {
  id: 'order-uuid-1',
  userId: 'user-uuid-1',
  itemName: 'Laptop Stand',
  quantity: 2,
  notes: 'Handle with care',
  status: 'pending',
  createdAt: '2026-01-01T10:00:00Z',
  updatedAt: '2026-01-01T10:00:00Z',
};

const mockListResponse: OrderListResponse = {
  data: [mockOrder],
  pagination: { hasNextPage: false, nextCursor: null },
};

describe('OrderService', () => {
  let service: OrderService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
    });
    service = TestBed.inject(OrderService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  describe('list', () => {
    it('should GET /v1/orders and return list response', () => {
      service.list().subscribe(res => {
        expect(res.data.length).toBe(1);
        expect(res.data[0].itemName).toBe('Laptop Stand');
      });

      const req = httpMock.expectOne(
        r => r.url.includes('/v1/orders') && r.method === 'GET'
      );
      req.flush(mockListResponse);
    });

    it('should append cursor query param when provided', () => {
      service.list({ cursor: 'cursor-abc', limit: 10 }).subscribe();
      const req = httpMock.expectOne(
        r =>
          r.url.includes('/v1/orders') &&
          r.params.get('cursor') === 'cursor-abc' &&
          r.params.get('limit') === '10'
      );
      req.flush(mockListResponse);
    });

    it('should append status query param when provided', () => {
      service.list({ status: 'pending' }).subscribe();
      const req = httpMock.expectOne(
        r =>
          r.url.includes('/v1/orders') && r.params.get('status') === 'pending'
      );
      req.flush(mockListResponse);
    });
  });

  describe('get', () => {
    it('should GET /v1/orders/:id', () => {
      service.get('order-uuid-1').subscribe(order => {
        expect(order.id).toBe('order-uuid-1');
      });

      const req = httpMock.expectOne(
        r => r.url.includes('/v1/orders/order-uuid-1') && r.method === 'GET'
      );
      req.flush(mockOrder);
    });
  });

  describe('create', () => {
    it('should POST /v1/orders with Idempotency-Key header', () => {
      const key = 'idem-key-1';
      service
        .create({ itemName: 'Laptop Stand', quantity: 1 }, key)
        .subscribe(order => {
          expect(order.itemName).toBe('Laptop Stand');
        });

      const req = httpMock.expectOne(
        r => r.url.includes('/v1/orders') && r.method === 'POST'
      );
      expect(req.request.headers.get('Idempotency-Key')).toBe(key);
      req.flush(mockOrder);
    });
  });

  describe('updateStatus', () => {
    it('should PATCH /v1/orders/:id/status', () => {
      service.updateStatus('order-uuid-1', 'confirmed').subscribe(order => {
        expect(order.status).toBe('confirmed');
      });

      const req = httpMock.expectOne(
        r =>
          r.url.includes('/v1/orders/order-uuid-1/status') &&
          r.method === 'PATCH'
      );
      expect(req.request.body).toEqual({ status: 'confirmed' });
      req.flush({ ...mockOrder, status: 'confirmed' });
    });
  });
});

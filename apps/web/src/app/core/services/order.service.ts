import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';

import { environment } from '../../../environments/environment';

export type OrderStatus =
  | 'pending'
  | 'confirmed'
  | 'shipped'
  | 'delivered'
  | 'cancelled';

export interface Order {
  id: string;
  userId: string;
  itemName: string;
  quantity: number;
  notes: string | null;
  status: OrderStatus;
  createdAt: string;
  updatedAt: string;
}

export interface OrderListResponse {
  data: Order[];
  pagination: {
    hasNextPage: boolean;
    nextCursor: string | null;
  };
}

export interface CreateOrderRequest {
  itemName: string;
  quantity: number;
  notes?: string;
}

export interface ListOrdersParams {
  cursor?: string;
  limit?: number;
  status?: OrderStatus;
}

@Injectable({ providedIn: 'root' })
export class OrderService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiBaseUrl}/v1/orders`;

  list(params: ListOrdersParams = {}): Observable<OrderListResponse> {
    let httpParams = new HttpParams();
    if (params.cursor) httpParams = httpParams.set('cursor', params.cursor);
    if (params.limit) httpParams = httpParams.set('limit', params.limit);
    if (params.status) httpParams = httpParams.set('status', params.status);
    return this.http.get<OrderListResponse>(this.base, {
      params: httpParams,
    });
  }

  get(id: string): Observable<Order> {
    return this.http.get<Order>(`${this.base}/${id}`);
  }

  create(
    payload: CreateOrderRequest,
    idempotencyKey: string
  ): Observable<Order> {
    return this.http.post<Order>(this.base, payload, {
      headers: { 'Idempotency-Key': idempotencyKey },
    });
  }

  updateStatus(id: string, status: OrderStatus): Observable<Order> {
    return this.http.patch<Order>(`${this.base}/${id}/status`, { status });
  }
}

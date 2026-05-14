import { inject } from '@angular/core';
import { patchState, signalStore, withMethods, withState } from '@ngrx/signals';
import { rxMethod } from '@ngrx/signals/rxjs-interop';
import { catchError, EMPTY, pipe, switchMap, tap } from 'rxjs';

import {
  Order,
  OrderService,
  OrderStatus,
  CreateOrderRequest,
  ListOrdersParams,
} from '../core/services/order.service';
import { ToastService } from '../core/services/toast.service';

interface OrdersState {
  orders: Order[];
  selectedOrder: Order | null;
  isLoading: boolean;
  isLoadingDetail: boolean;
  hasNextPage: boolean;
  nextCursor: string | null;
  error: string | null;
}

const initialState: OrdersState = {
  orders: [],
  selectedOrder: null,
  isLoading: false,
  isLoadingDetail: false,
  hasNextPage: false,
  nextCursor: null,
  error: null,
};

export const OrdersStore = signalStore(
  { providedIn: 'root' },
  withState(initialState),
  withMethods(
    (
      store,
      orderService = inject(OrderService),
      toastService = inject(ToastService)
    ) => ({
      loadOrders: rxMethod<ListOrdersParams>(
        pipe(
          tap(() => patchState(store, { isLoading: true, error: null })),
          switchMap(params =>
            orderService.list(params).pipe(
              tap(res => {
                patchState(store, {
                  orders: params.cursor
                    ? [...store.orders(), ...res.data]
                    : res.data,
                  hasNextPage: res.pagination.hasNextPage,
                  nextCursor: res.pagination.nextCursor,
                  isLoading: false,
                });
              }),
              catchError((err: { error?: { message?: string } }) => {
                patchState(store, {
                  isLoading: false,
                  error: err.error?.message ?? 'Failed to load orders',
                });
                return EMPTY;
              })
            )
          )
        )
      ),

      loadOrder: rxMethod<string>(
        pipe(
          tap(() =>
            patchState(store, { isLoadingDetail: true, selectedOrder: null })
          ),
          switchMap(id =>
            orderService.get(id).pipe(
              tap(order => {
                patchState(store, {
                  selectedOrder: order,
                  isLoadingDetail: false,
                });
              }),
              catchError(() => {
                patchState(store, { isLoadingDetail: false });
                return EMPTY;
              })
            )
          )
        )
      ),

      createOrder: rxMethod<{
        payload: CreateOrderRequest;
        idempotencyKey: string;
      }>(
        pipe(
          switchMap(({ payload, idempotencyKey }) =>
            orderService.create(payload, idempotencyKey).pipe(
              tap(order => {
                patchState(store, {
                  orders: [order, ...store.orders()],
                });
                toastService.success('Order created successfully!');
              }),
              catchError((err: { error?: { message?: string } }) => {
                toastService.error(
                  err.error?.message ?? 'Failed to create order'
                );
                return EMPTY;
              })
            )
          )
        )
      ),

      updateOrderStatus: rxMethod<{ id: string; status: OrderStatus }>(
        pipe(
          switchMap(({ id, status }) =>
            orderService.updateStatus(id, status).pipe(
              tap(updated => {
                patchState(store, {
                  orders: store
                    .orders()
                    .map(o => (o.id === updated.id ? updated : o)),
                  selectedOrder:
                    store.selectedOrder()?.id === updated.id
                      ? updated
                      : store.selectedOrder(),
                });
                toastService.success(
                  `Order status updated to ${updated.status}`
                );
              }),
              catchError((err: { error?: { message?: string } }) => {
                toastService.error(
                  err.error?.message ?? 'Failed to update order status'
                );
                return EMPTY;
              })
            )
          )
        )
      ),

      applyRealtimeUpdate(event: { orderId: string; status: string }): void {
        patchState(store, {
          orders: store
            .orders()
            .map(o =>
              o.id === event.orderId
                ? { ...o, status: event.status as OrderStatus }
                : o
            ),
          selectedOrder:
            store.selectedOrder()?.id === event.orderId
              ? {
                  ...(store.selectedOrder() as NonNullable<
                    ReturnType<typeof store.selectedOrder>
                  >),
                  status: event.status as OrderStatus,
                }
              : store.selectedOrder(),
        });
      },
    })
  )
);

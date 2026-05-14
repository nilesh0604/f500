import { Component, OnInit, OnDestroy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTableModule } from '@angular/material/table';
import { MatChipsModule } from '@angular/material/chips';
import { MatDialog } from '@angular/material/dialog';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { Subscription } from 'rxjs';

import { OrdersStore } from '../../../store/orders.store';
import { AuthStore } from '../../../store/auth.store';
import { WebSocketService } from '../../../core/services/websocket.service';
import { StatusBadgeComponent } from '../../../shared/components/status-badge/status-badge.component';
import { SkeletonComponent } from '../../../shared/components/skeleton/skeleton.component';
import { CreateOrderDialogComponent } from '../create-order-dialog/create-order-dialog.component';
import { Order } from '../../../core/services/order.service';

@Component({
  selector: 'app-order-list',
  standalone: true,
  imports: [
    CommonModule,
    RouterLink,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatTableModule,
    MatChipsModule,
    MatToolbarModule,
    MatTooltipModule,
    StatusBadgeComponent,
    SkeletonComponent,
  ],
  template: `
    <div class="page">
      <!-- Toolbar -->
      <mat-toolbar class="page-toolbar">
        <mat-icon class="page-toolbar__logo">local_shipping</mat-icon>
        <span class="page-toolbar__title">OrderFlow</span>
        <span class="page-toolbar__spacer"></span>
        <span
          class="page-toolbar__ws-indicator"
          [class.page-toolbar__ws-indicator--connected]="
            wsService.isConnected()
          "
          matTooltip="{{
            wsService.isConnected()
              ? 'Real-time updates active'
              : 'Real-time updates disconnected'
          }}"
          role="status"
          [attr.aria-label]="
            wsService.isConnected()
              ? 'Real-time connected'
              : 'Real-time disconnected'
          "
        >
          <mat-icon>{{
            wsService.isConnected() ? 'wifi' : 'wifi_off'
          }}</mat-icon>
        </span>
        <button
          mat-icon-button
          matTooltip="Sign out"
          aria-label="Sign out"
          (click)="authStore.logout()"
        >
          <mat-icon>logout</mat-icon>
        </button>
      </mat-toolbar>

      <div class="container">
        <!-- Header row -->
        <div class="list-header">
          <div>
            <h2 class="list-header__title">My Orders</h2>
            <p class="list-header__subtitle">
              {{ ordersStore.orders().length }} order{{
                ordersStore.orders().length !== 1 ? 's' : ''
              }}
            </p>
          </div>
          <button
            mat-flat-button
            color="primary"
            (click)="openCreateDialog()"
            aria-label="Create new order"
          >
            <mat-icon>add</mat-icon>
            New Order
          </button>
        </div>

        <!-- Skeleton loading -->
        @if (ordersStore.isLoading() && ordersStore.orders().length === 0) {
          <div class="skeleton-table" aria-label="Loading orders...">
            @for (i of [1, 2, 3, 4, 5]; track i) {
              <div class="skeleton-row">
                <app-skeleton width="40%" height="16px" />
                <app-skeleton width="15%" height="16px" />
                <app-skeleton width="20%" height="22px" borderRadius="9999px" />
                <app-skeleton width="18%" height="14px" />
              </div>
            }
          </div>
        }

        <!-- Orders table -->
        @if (!ordersStore.isLoading() || ordersStore.orders().length > 0) {
          @if (ordersStore.orders().length === 0) {
            <div class="empty-state">
              <mat-icon class="empty-state__icon">inbox</mat-icon>
              <h3 class="empty-state__title">No orders yet</h3>
              <p class="empty-state__subtitle">
                Create your first order to get started
              </p>
              <button
                mat-flat-button
                color="primary"
                (click)="openCreateDialog()"
              >
                Create Order
              </button>
            </div>
          } @else {
            <mat-card class="orders-card">
              <table
                mat-table
                [dataSource]="ordersStore.orders()"
                class="orders-table"
                aria-label="Orders list"
              >
                <!-- Item Name -->
                <ng-container matColumnDef="itemName">
                  <th mat-header-cell *matHeaderCellDef>Item</th>
                  <td mat-cell *matCellDef="let order">
                    <a
                      [routerLink]="['/orders', order.id]"
                      class="order-link"
                      [attr.aria-label]="'View order for ' + order.itemName"
                      >{{ order.itemName }}</a
                    >
                  </td>
                </ng-container>

                <!-- Quantity -->
                <ng-container matColumnDef="quantity">
                  <th mat-header-cell *matHeaderCellDef>Qty</th>
                  <td mat-cell *matCellDef="let order">{{ order.quantity }}</td>
                </ng-container>

                <!-- Status -->
                <ng-container matColumnDef="status">
                  <th mat-header-cell *matHeaderCellDef>Status</th>
                  <td mat-cell *matCellDef="let order">
                    <app-status-badge [status]="order.status" />
                  </td>
                </ng-container>

                <!-- Date -->
                <ng-container matColumnDef="createdAt">
                  <th mat-header-cell *matHeaderCellDef>Created</th>
                  <td mat-cell *matCellDef="let order">
                    {{ order.createdAt | date: 'MMM d, y, h:mm a' }}
                  </td>
                </ng-container>

                <!-- Actions -->
                <ng-container matColumnDef="actions">
                  <th mat-header-cell *matHeaderCellDef></th>
                  <td mat-cell *matCellDef="let order">
                    <a
                      mat-icon-button
                      [routerLink]="['/orders', order.id]"
                      matTooltip="View details"
                      [attr.aria-label]="
                        'View details for order ' + order.itemName
                      "
                    >
                      <mat-icon>chevron_right</mat-icon>
                    </a>
                  </td>
                </ng-container>

                <tr mat-header-row *matHeaderRowDef="displayedColumns"></tr>
                <tr
                  mat-row
                  *matRowDef="let row; columns: displayedColumns"
                  class="orders-table__row"
                ></tr>
              </table>
            </mat-card>

            <!-- Load more -->
            @if (ordersStore.hasNextPage()) {
              <div class="load-more">
                <button
                  mat-stroked-button
                  (click)="loadMore()"
                  [disabled]="ordersStore.isLoading()"
                  aria-label="Load more orders"
                >
                  @if (ordersStore.isLoading()) {
                    Loading...
                  } @else {
                    Load more
                  }
                </button>
              </div>
            }
          }
        }
      </div>
    </div>
  `,
  styles: [
    `
      .page-toolbar {
        background: #1565c0;
        color: #fff;
        position: sticky;
        top: 0;
        z-index: 100;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
      }

      .page-toolbar__logo {
        margin-right: 8px;
      }
      .page-toolbar__title {
        font-weight: 700;
        font-size: 18px;
      }
      .page-toolbar__spacer {
        flex: 1;
      }

      .page-toolbar__ws-indicator {
        display: flex;
        align-items: center;
        opacity: 0.5;
        margin-right: 8px;
        cursor: default;

        &--connected {
          opacity: 1;
        }
      }

      .container {
        max-width: 1100px;
        margin: 0 auto;
        padding: 24px 16px;
      }

      .list-header {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        margin-bottom: 24px;
      }

      .list-header__title {
        font-size: 24px;
        font-weight: 700;
        margin: 0;
      }

      .list-header__subtitle {
        font-size: 13px;
        color: rgba(0, 0, 0, 0.54);
        margin: 4px 0 0;
      }

      .skeleton-table {
        display: flex;
        flex-direction: column;
        gap: 12px;
      }

      .skeleton-row {
        display: flex;
        align-items: center;
        gap: 24px;
        padding: 16px;
        background: #fff;
        border-radius: 8px;
        border: 1px solid #e0e0e0;
      }

      .empty-state {
        text-align: center;
        padding: 64px 24px;
      }

      .empty-state__icon {
        font-size: 64px;
        width: 64px;
        height: 64px;
        color: rgba(0, 0, 0, 0.2);
        margin-bottom: 16px;
      }

      .empty-state__title {
        font-size: 20px;
        font-weight: 600;
        margin: 0 0 8px;
      }

      .empty-state__subtitle {
        color: rgba(0, 0, 0, 0.54);
        margin-bottom: 24px;
      }

      .orders-card {
        overflow: hidden;
        border-radius: 12px !important;
      }

      .orders-table {
        width: 100%;
      }

      .orders-table__row:hover {
        background: #f5f7fa;
        cursor: pointer;
      }

      .order-link {
        color: #1565c0;
        font-weight: 500;
        text-decoration: none;

        &:hover {
          text-decoration: underline;
        }
      }

      .load-more {
        display: flex;
        justify-content: center;
        margin-top: 24px;
      }
    `,
  ],
})
export class OrderListComponent implements OnInit, OnDestroy {
  readonly ordersStore = inject(OrdersStore);
  readonly authStore = inject(AuthStore);
  readonly wsService = inject(WebSocketService);
  private readonly dialog = inject(MatDialog);
  private wsSub?: Subscription;

  readonly displayedColumns = [
    'itemName',
    'quantity',
    'status',
    'createdAt',
    'actions',
  ];

  ngOnInit(): void {
    this.ordersStore.loadOrders({});
    this.wsService.connect();
    this.wsSub = this.wsService.orderStatus$.subscribe(event => {
      this.ordersStore.applyRealtimeUpdate(event);
    });
  }

  ngOnDestroy(): void {
    this.wsSub?.unsubscribe();
  }

  openCreateDialog(): void {
    this.dialog.open(CreateOrderDialogComponent, {
      width: '480px',
      disableClose: false,
    });
  }

  loadMore(): void {
    const cursor = this.ordersStore.nextCursor();
    if (cursor) {
      this.ordersStore.loadOrders({ cursor });
    }
  }

  trackById(_: number, order: Order): string {
    return order.id;
  }
}

import { Component, OnInit, OnDestroy, inject, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatDividerModule } from '@angular/material/divider';
import { MatSelectModule } from '@angular/material/select';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { FormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';

import { OrdersStore } from '../../../store/orders.store';
import { AuthStore } from '../../../store/auth.store';
import { WebSocketService } from '../../../core/services/websocket.service';
import { ToastService } from '../../../core/services/toast.service';
import { StatusBadgeComponent } from '../../../shared/components/status-badge/status-badge.component';
import { SkeletonComponent } from '../../../shared/components/skeleton/skeleton.component';
import { OrderStatus } from '../../../core/services/order.service';

interface StatusStep {
  status: OrderStatus;
  label: string;
  icon: string;
}

const STATUS_STEPS: StatusStep[] = [
  { status: 'pending', label: 'Pending', icon: 'hourglass_empty' },
  { status: 'confirmed', label: 'Confirmed', icon: 'check_circle_outline' },
  { status: 'shipped', label: 'Shipped', icon: 'local_shipping' },
  { status: 'delivered', label: 'Delivered', icon: 'done_all' },
];

const NEXT_STATUS: Partial<Record<OrderStatus, OrderStatus>> = {
  pending: 'confirmed',
  confirmed: 'shipped',
  shipped: 'delivered',
};

@Component({
  selector: 'app-order-detail',
  standalone: true,
  imports: [
    CommonModule,
    RouterLink,
    FormsModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatToolbarModule,
    MatDividerModule,
    MatSelectModule,
    MatFormFieldModule,
    MatProgressSpinnerModule,
    StatusBadgeComponent,
    SkeletonComponent,
  ],
  template: `
    <div class="page">
      <!-- Toolbar -->
      <mat-toolbar class="page-toolbar">
        <button
          mat-icon-button
          routerLink="/orders"
          aria-label="Back to orders"
        >
          <mat-icon>arrow_back</mat-icon>
        </button>
        <span class="page-toolbar__title">Order Detail</span>
        <span class="page-toolbar__spacer"></span>
        <button
          mat-icon-button
          aria-label="Sign out"
          (click)="authStore.logout()"
        >
          <mat-icon>logout</mat-icon>
        </button>
      </mat-toolbar>

      <div class="container">
        <!-- Skeleton -->
        @if (ordersStore.isLoadingDetail()) {
          <div class="detail-skeleton" aria-label="Loading order details...">
            <app-skeleton width="60%" height="28px" />
            <app-skeleton width="30%" height="20px" borderRadius="9999px" />
            <app-skeleton width="100%" height="120px" borderRadius="12px" />
            <app-skeleton width="100%" height="80px" borderRadius="12px" />
          </div>
        }

        @if (ordersStore.selectedOrder(); as order) {
          <!-- Order header -->
          <div class="detail-header">
            <div>
              <h2 class="detail-header__title">{{ order.itemName }}</h2>
              <p class="detail-header__id">ID: {{ order.id }}</p>
            </div>
            <app-status-badge [status]="order.status" />
          </div>

          <!-- Status timeline -->
          <mat-card class="timeline-card">
            <mat-card-header>
              <mat-card-title>Status Timeline</mat-card-title>
            </mat-card-header>
            <mat-card-content>
              <div
                class="timeline"
                role="list"
                aria-label="Order status timeline"
              >
                @for (step of statusSteps; track step.status; let i = $index) {
                  <div
                    class="timeline__step"
                    [class.timeline__step--active]="
                      isActive(order.status, step.status)
                    "
                    [class.timeline__step--current]="
                      order.status === step.status
                    "
                    role="listitem"
                    [attr.aria-label]="
                      step.label +
                      (order.status === step.status ? ' (current)' : '')
                    "
                  >
                    <div class="timeline__icon">
                      <mat-icon>{{ step.icon }}</mat-icon>
                    </div>
                    <div class="timeline__content">
                      <span class="timeline__label">{{ step.label }}</span>
                    </div>
                    @if (i < statusSteps.length - 1) {
                      <div
                        class="timeline__connector"
                        [class.timeline__connector--active]="
                          isActive(order.status, step.status)
                        "
                      ></div>
                    }
                  </div>
                }
              </div>
            </mat-card-content>
          </mat-card>

          <!-- Order details card -->
          <mat-card class="info-card">
            <mat-card-header>
              <mat-card-title>Order Information</mat-card-title>
            </mat-card-header>
            <mat-card-content>
              <div class="info-grid">
                <div class="info-grid__item">
                  <span class="info-grid__label">Item</span>
                  <span class="info-grid__value">{{ order.itemName }}</span>
                </div>
                <div class="info-grid__item">
                  <span class="info-grid__label">Quantity</span>
                  <span class="info-grid__value">{{ order.quantity }}</span>
                </div>
                <div class="info-grid__item">
                  <span class="info-grid__label">Created</span>
                  <span class="info-grid__value">{{
                    order.createdAt | date: 'medium'
                  }}</span>
                </div>
                <div class="info-grid__item">
                  <span class="info-grid__label">Last Updated</span>
                  <span class="info-grid__value">{{
                    order.updatedAt | date: 'medium'
                  }}</span>
                </div>
                @if (order.notes) {
                  <div class="info-grid__item info-grid__item--full">
                    <span class="info-grid__label">Notes</span>
                    <span class="info-grid__value">{{ order.notes }}</span>
                  </div>
                }
              </div>
            </mat-card-content>
          </mat-card>

          <!-- Update status action -->
          @if (nextStatus(order.status); as next) {
            <mat-card class="action-card">
              <mat-card-header>
                <mat-card-title>Update Status</mat-card-title>
              </mat-card-header>
              <mat-card-content>
                <p class="action-card__description">
                  Advance this order from
                  <strong>{{ order.status }}</strong> to
                  <strong>{{ next }}</strong>
                </p>
              </mat-card-content>
              <mat-card-actions>
                <button
                  mat-flat-button
                  color="primary"
                  [disabled]="ordersStore.isLoading()"
                  aria-label="Advance order status"
                  (click)="advanceStatus(order.id, next)"
                >
                  <mat-icon>arrow_forward</mat-icon>
                  Mark as {{ next | titlecase }}
                </button>
              </mat-card-actions>
            </mat-card>
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

      .page-toolbar__title {
        font-weight: 700;
        font-size: 18px;
      }
      .page-toolbar__spacer {
        flex: 1;
      }

      .container {
        max-width: 800px;
        margin: 0 auto;
        padding: 24px 16px;
        display: flex;
        flex-direction: column;
        gap: 20px;
      }

      .detail-skeleton {
        display: flex;
        flex-direction: column;
        gap: 16px;
      }

      .detail-header {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 16px;
      }

      .detail-header__title {
        font-size: 24px;
        font-weight: 700;
        margin: 0 0 4px;
      }

      .detail-header__id {
        font-size: 12px;
        color: rgba(0, 0, 0, 0.45);
        font-family: monospace;
        margin: 0;
      }

      .timeline {
        display: flex;
        align-items: flex-start;
        padding: 8px 0;
        overflow-x: auto;
      }

      .timeline__step {
        display: flex;
        flex-direction: column;
        align-items: center;
        position: relative;
        flex: 1;
        min-width: 80px;
      }

      .timeline__icon {
        width: 44px;
        height: 44px;
        border-radius: 50%;
        background: #e0e0e0;
        display: flex;
        align-items: center;
        justify-content: center;
        color: rgba(0, 0, 0, 0.38);
        z-index: 1;
        transition: all 0.25s ease;

        .timeline__step--active & {
          background: #1565c0;
          color: #fff;
        }

        .timeline__step--current & {
          background: #1565c0;
          color: #fff;
          box-shadow: 0 0 0 4px rgba(21, 101, 192, 0.2);
        }
      }

      .timeline__label {
        font-size: 11px;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.4px;
        color: rgba(0, 0, 0, 0.38);
        margin-top: 6px;
        text-align: center;

        .timeline__step--active & {
          color: #1565c0;
        }
      }

      .timeline__connector {
        position: absolute;
        top: 22px;
        left: calc(50% + 22px);
        right: calc(-50% + 22px);
        height: 2px;
        background: #e0e0e0;
        z-index: 0;

        &--active {
          background: #1565c0;
        }
      }

      .info-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 20px;
        padding-top: 8px;
      }

      .info-grid__item {
        display: flex;
        flex-direction: column;
        gap: 4px;

        &--full {
          grid-column: 1 / -1;
        }
      }

      .info-grid__label {
        font-size: 11px;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.5px;
        color: rgba(0, 0, 0, 0.45);
      }

      .info-grid__value {
        font-size: 15px;
        color: #212121;
      }

      .action-card__description {
        color: rgba(0, 0, 0, 0.6);
        font-size: 14px;
        margin: 0;
      }
    `,
  ],
})
export class OrderDetailComponent implements OnInit, OnDestroy {
  @Input() id!: string;

  readonly ordersStore = inject(OrdersStore);
  readonly authStore = inject(AuthStore);
  readonly wsService = inject(WebSocketService);
  private readonly toastService = inject(ToastService);

  readonly statusSteps = STATUS_STEPS;
  private wsSub?: Subscription;

  ngOnInit(): void {
    this.ordersStore.loadOrder(this.id);
    this.wsService.connect();
    this.wsSub = this.wsService.orderStatus$.subscribe(event => {
      if (event.orderId === this.id) {
        this.ordersStore.applyRealtimeUpdate(event);
        this.toastService.success(`Order status updated to ${event.status}`);
      }
    });
  }

  ngOnDestroy(): void {
    this.wsSub?.unsubscribe();
  }

  isActive(currentStatus: OrderStatus, stepStatus: OrderStatus): boolean {
    const order = [
      'pending',
      'confirmed',
      'shipped',
      'delivered',
    ] as OrderStatus[];
    return order.indexOf(currentStatus) >= order.indexOf(stepStatus);
  }

  nextStatus(current: OrderStatus): OrderStatus | null {
    return NEXT_STATUS[current] ?? null;
  }

  advanceStatus(orderId: string, status: OrderStatus): void {
    this.ordersStore.updateOrderStatus({ id: orderId, status });
  }
}

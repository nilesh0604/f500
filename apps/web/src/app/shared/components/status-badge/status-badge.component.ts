import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

import { OrderStatus } from '../../../core/services/order.service';

const STATUS_CONFIG: Record<
  OrderStatus,
  { label: string; icon: string; color: string }
> = {
  pending: { label: 'Pending', icon: '●', color: '#e65100' },
  confirmed: { label: 'Confirmed', icon: '●', color: '#1565c0' },
  shipped: { label: 'Shipped', icon: '●', color: '#6a1b9a' },
  delivered: { label: 'Delivered', icon: '●', color: '#1b5e20' },
  cancelled: { label: 'Cancelled', icon: '●', color: '#b71c1c' },
};

@Component({
  selector: 'app-status-badge',
  standalone: true,
  imports: [CommonModule],
  template: `
    <span
      class="status-badge"
      [style.background-color]="config.color + '1f'"
      [style.color]="config.color"
      [attr.aria-label]="'Status: ' + config.label"
    >
      <span class="status-badge__dot" aria-hidden="true">{{
        config.icon
      }}</span>
      {{ config.label }}
    </span>
  `,
  styles: [
    `
      .status-badge {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        padding: 2px 10px;
        border-radius: 9999px;
        font-size: 11px;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.5px;
        white-space: nowrap;
      }

      .status-badge__dot {
        font-size: 8px;
        line-height: 1;
      }
    `,
  ],
})
export class StatusBadgeComponent {
  @Input({ required: true }) status!: OrderStatus;

  get config(): { label: string; icon: string; color: string } {
    return STATUS_CONFIG[this.status] ?? STATUS_CONFIG['pending'];
  }
}

import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';

import { ToastService, Toast } from '../../../core/services/toast.service';

@Component({
  selector: 'app-toast',
  standalone: true,
  imports: [CommonModule, MatIconModule, MatButtonModule],
  template: `
    <div class="toast-container" aria-live="polite" aria-atomic="false">
      @for (toast of toastService.toasts(); track toast.id) {
        <div
          class="toast toast--{{ toast.type }}"
          role="alert"
          aria-label="{{ toast.message }}"
        >
          <mat-icon class="toast__icon">{{ iconFor(toast) }}</mat-icon>
          <span class="toast__message">{{ toast.message }}</span>
          <button
            mat-icon-button
            class="toast__close"
            aria-label="Dismiss notification"
            (click)="toastService.dismiss(toast.id)"
          >
            <mat-icon>close</mat-icon>
          </button>
        </div>
      }
    </div>
  `,
  styles: [
    `
      .toast-container {
        position: fixed;
        bottom: 24px;
        right: 24px;
        z-index: 9999;
        display: flex;
        flex-direction: column;
        gap: 8px;
        max-width: 400px;
      }

      .toast {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 12px 16px;
        border-radius: 8px;
        color: #fff;
        font-size: 14px;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
        animation: slideIn 0.2s ease;

        &--success {
          background: #1b5e20;
        }
        &--error {
          background: #b71c1c;
        }
        &--warn {
          background: #e65100;
        }
        &--info {
          background: #1565c0;
        }
      }

      .toast__message {
        flex: 1;
      }

      .toast__close {
        color: rgba(255, 255, 255, 0.8);
        width: 28px;
        height: 28px;
        line-height: 28px;
      }

      @keyframes slideIn {
        from {
          transform: translateX(100%);
          opacity: 0;
        }
        to {
          transform: translateX(0);
          opacity: 1;
        }
      }
    `,
  ],
})
export class ToastComponent {
  readonly toastService = inject(ToastService);

  iconFor(toast: Toast): string {
    const icons: Record<string, string> = {
      success: 'check_circle',
      error: 'error',
      warn: 'warning',
      info: 'info',
    };
    return icons[toast.type] ?? 'info';
  }
}

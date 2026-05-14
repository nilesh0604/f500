import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  FormBuilder,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

import { OrdersStore } from '../../../store/orders.store';

@Component({
  selector: 'app-create-order-dialog',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatProgressSpinnerModule,
  ],
  template: `
    <h2 mat-dialog-title>Create New Order</h2>

    <mat-dialog-content>
      <form
        [formGroup]="form"
        (ngSubmit)="onSubmit()"
        novalidate
        aria-label="Create order form"
        id="createOrderForm"
      >
        <mat-form-field appearance="outline" class="dialog__field">
          <mat-label>Item Name</mat-label>
          <input
            matInput
            formControlName="itemName"
            placeholder="e.g. Laptop Stand"
            maxlength="255"
            aria-required="true"
          />
          @if (form.get('itemName')?.invalid && form.get('itemName')?.touched) {
            <mat-error>Item name is required (max 255 characters)</mat-error>
          }
        </mat-form-field>

        <mat-form-field appearance="outline" class="dialog__field">
          <mat-label>Quantity</mat-label>
          <input
            matInput
            type="number"
            formControlName="quantity"
            min="1"
            max="9999"
            aria-required="true"
          />
          @if (form.get('quantity')?.invalid && form.get('quantity')?.touched) {
            <mat-error>Quantity must be between 1 and 9999</mat-error>
          }
        </mat-form-field>

        <mat-form-field appearance="outline" class="dialog__field">
          <mat-label>Notes (optional)</mat-label>
          <textarea
            matInput
            formControlName="notes"
            rows="3"
            maxlength="1000"
            placeholder="Any special instructions..."
          ></textarea>
        </mat-form-field>
      </form>
    </mat-dialog-content>

    <mat-dialog-actions align="end">
      <button mat-button type="button" (click)="dialogRef.close()">
        Cancel
      </button>
      <button
        mat-flat-button
        color="primary"
        type="submit"
        form="createOrderForm"
        [disabled]="form.invalid || ordersStore.isLoading()"
      >
        @if (ordersStore.isLoading()) {
          <mat-spinner diameter="18" />
        } @else {
          Create Order
        }
      </button>
    </mat-dialog-actions>
  `,
  styles: [
    `
      .dialog__field {
        width: 100%;
        margin-bottom: 8px;
        display: block;
      }

      mat-dialog-content {
        min-width: 360px;
        padding-top: 8px !important;
      }
    `,
  ],
})
export class CreateOrderDialogComponent {
  private readonly fb = inject(FormBuilder);
  readonly dialogRef = inject(MatDialogRef<CreateOrderDialogComponent>);
  readonly ordersStore = inject(OrdersStore);

  form: FormGroup = this.fb.group({
    itemName: ['', [Validators.required, Validators.maxLength(255)]],
    quantity: [
      1,
      [Validators.required, Validators.min(1), Validators.max(9999)],
    ],
    notes: ['', Validators.maxLength(1000)],
  });

  onSubmit(): void {
    if (this.form.invalid) return;
    const { itemName, quantity, notes } = this.form.getRawValue();
    this.ordersStore.createOrder({
      payload: { itemName, quantity, notes: notes || undefined },
      idempotencyKey: crypto.randomUUID(),
    });
    this.dialogRef.close();
  }
}

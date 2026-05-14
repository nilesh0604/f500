import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  FormBuilder,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { RouterLink } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatIconModule } from '@angular/material/icon';

import { AuthStore } from '../../../store/auth.store';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    RouterLink,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatProgressSpinnerModule,
    MatIconModule,
  ],
  template: `
    <div class="auth-page">
      <div class="auth-page__brand">
        <mat-icon class="auth-page__logo">local_shipping</mat-icon>
        <h1 class="auth-page__title">OrderFlow</h1>
        <p class="auth-page__subtitle">Real-Time Order Management</p>
      </div>

      <mat-card class="auth-card">
        <mat-card-header>
          <mat-card-title>Sign in</mat-card-title>
          <mat-card-subtitle
            >Enter your credentials to continue</mat-card-subtitle
          >
        </mat-card-header>

        <mat-card-content>
          @if (authStore.error()) {
            <div class="auth-card__error" role="alert">
              <mat-icon>error_outline</mat-icon>
              {{ authStore.error() }}
            </div>
          }

          <form
            [formGroup]="form"
            (ngSubmit)="onSubmit()"
            novalidate
            aria-label="Login form"
          >
            <mat-form-field appearance="outline" class="auth-card__field">
              <mat-label>Email</mat-label>
              <input
                matInput
                type="email"
                formControlName="email"
                autocomplete="email"
                placeholder="you@example.com"
                aria-required="true"
              />
              <mat-icon matSuffix>email</mat-icon>
              @if (form.get('email')?.invalid && form.get('email')?.touched) {
                <mat-error>Valid email is required</mat-error>
              }
            </mat-form-field>

            <mat-form-field appearance="outline" class="auth-card__field">
              <mat-label>Password</mat-label>
              <input
                matInput
                [type]="showPassword ? 'text' : 'password'"
                formControlName="password"
                autocomplete="current-password"
                aria-required="true"
              />
              <button
                mat-icon-button
                matSuffix
                type="button"
                [attr.aria-label]="
                  showPassword ? 'Hide password' : 'Show password'
                "
                (click)="showPassword = !showPassword"
              >
                <mat-icon>{{
                  showPassword ? 'visibility_off' : 'visibility'
                }}</mat-icon>
              </button>
              @if (
                form.get('password')?.invalid && form.get('password')?.touched
              ) {
                <mat-error>Password is required</mat-error>
              }
            </mat-form-field>

            <button
              mat-flat-button
              color="primary"
              type="submit"
              class="auth-card__submit"
              [disabled]="form.invalid || authStore.isLoading()"
              aria-label="Sign in"
            >
              @if (authStore.isLoading()) {
                <mat-spinner diameter="20" />
              } @else {
                Sign in
              }
            </button>
          </form>
        </mat-card-content>

        <mat-card-actions align="end">
          <span class="auth-card__link-text">Don't have an account?</span>
          <a mat-button color="primary" routerLink="/auth/register">
            Create account
          </a>
        </mat-card-actions>
      </mat-card>
    </div>
  `,
  styles: [
    `
      .auth-page {
        min-height: 100vh;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding: 24px;
        background: linear-gradient(135deg, #1565c0 0%, #0d47a1 100%);
      }

      .auth-page__brand {
        text-align: center;
        margin-bottom: 32px;
        color: #fff;
      }

      .auth-page__logo {
        font-size: 48px;
        width: 48px;
        height: 48px;
        margin-bottom: 8px;
      }

      .auth-page__title {
        font-size: 32px;
        font-weight: 700;
        margin: 0;
        letter-spacing: -0.5px;
      }

      .auth-page__subtitle {
        font-size: 14px;
        opacity: 0.85;
        margin: 4px 0 0;
      }

      .auth-card {
        width: 100%;
        max-width: 420px;
        border-radius: 16px !important;
      }

      .auth-card__error {
        display: flex;
        align-items: center;
        gap: 8px;
        background: #ffebee;
        color: #b71c1c;
        padding: 10px 14px;
        border-radius: 8px;
        font-size: 13px;
        margin-bottom: 16px;
      }

      .auth-card__field {
        width: 100%;
        margin-bottom: 4px;
      }

      .auth-card__submit {
        width: 100%;
        height: 44px;
        margin-top: 8px;
        font-size: 15px;
        font-weight: 600;
      }

      .auth-card__link-text {
        font-size: 13px;
        color: rgba(0, 0, 0, 0.6);
        margin-right: 4px;
      }
    `,
  ],
})
export class LoginComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  readonly authStore = inject(AuthStore);

  form!: FormGroup;
  showPassword = false;

  ngOnInit(): void {
    this.form = this.fb.group({
      email: ['', [Validators.required, Validators.email]],
      password: ['', Validators.required],
    });
    this.authStore.init();
  }

  onSubmit(): void {
    if (this.form.invalid) return;
    this.authStore.login(this.form.getRawValue());
  }
}

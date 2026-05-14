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
import { MatCheckboxModule } from '@angular/material/checkbox';

import { AuthStore } from '../../../store/auth.store';

@Component({
  selector: 'app-register',
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
    MatCheckboxModule,
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
          <mat-card-title>Create account</mat-card-title>
          <mat-card-subtitle>Get started with OrderFlow</mat-card-subtitle>
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
            aria-label="Registration form"
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
                autocomplete="new-password"
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
                <mat-error>
                  Password must be 8–72 characters with uppercase, lowercase,
                  number and special character
                </mat-error>
              }
            </mat-form-field>

            <mat-checkbox
              formControlName="consent"
              class="auth-card__consent"
              aria-required="true"
            >
              I consent to the processing of my personal data
            </mat-checkbox>
            @if (form.get('consent')?.invalid && form.get('consent')?.touched) {
              <p class="auth-card__consent-error">
                Consent is required to register
              </p>
            }

            <button
              mat-flat-button
              color="primary"
              type="submit"
              class="auth-card__submit"
              [disabled]="form.invalid || authStore.isLoading()"
              aria-label="Create account"
            >
              @if (authStore.isLoading()) {
                <mat-spinner diameter="20" />
              } @else {
                Create account
              }
            </button>
          </form>
        </mat-card-content>

        <mat-card-actions align="end">
          <span class="auth-card__link-text">Already have an account?</span>
          <a mat-button color="primary" routerLink="/auth/login">Sign in</a>
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

      .auth-card__consent {
        display: block;
        margin: 8px 0 4px;
        font-size: 13px;
      }

      .auth-card__consent-error {
        color: #b71c1c;
        font-size: 12px;
        margin: 0 0 8px 2px;
      }

      .auth-card__submit {
        width: 100%;
        height: 44px;
        margin-top: 12px;
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
export class RegisterComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  readonly authStore = inject(AuthStore);

  form!: FormGroup;
  showPassword = false;

  ngOnInit(): void {
    const passwordPattern =
      /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]).{8,72}$/;

    this.form = this.fb.group({
      email: ['', [Validators.required, Validators.email]],
      password: [
        '',
        [Validators.required, Validators.pattern(passwordPattern)],
      ],
      consent: [false, Validators.requiredTrue],
    });
    this.authStore.init();
  }

  onSubmit(): void {
    if (this.form.invalid) return;
    const { email, password } = this.form.getRawValue();
    this.authStore.register({
      email,
      password,
      consentTimestamp: new Date().toISOString(),
    });
  }
}

import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { patchState, signalStore, withMethods, withState } from '@ngrx/signals';
import { rxMethod } from '@ngrx/signals/rxjs-interop';
import { catchError, EMPTY, pipe, switchMap, tap } from 'rxjs';

import {
  AuthService,
  LoginRequest,
  RegisterRequest,
} from '../core/services/auth.service';
import { ToastService } from '../core/services/toast.service';

interface AuthState {
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
}

const initialState: AuthState = {
  isAuthenticated: false,
  isLoading: false,
  error: null,
};

export const AuthStore = signalStore(
  { providedIn: 'root' },
  withState(initialState),
  withMethods(
    (
      store,
      authService = inject(AuthService),
      router = inject(Router),
      toastService = inject(ToastService)
    ) => ({
      init(): void {
        patchState(store, {
          isAuthenticated: authService.isAuthenticated(),
        });
      },

      login: rxMethod<LoginRequest>(
        pipe(
          tap(() => patchState(store, { isLoading: true, error: null })),
          switchMap(payload =>
            authService.login(payload).pipe(
              tap(() => {
                patchState(store, { isAuthenticated: true, isLoading: false });
                void router.navigate(['/orders']);
              }),
              catchError((err: { error?: { message?: string } }) => {
                patchState(store, {
                  isLoading: false,
                  error: err.error?.message ?? 'Login failed',
                });
                return EMPTY;
              })
            )
          )
        )
      ),

      register: rxMethod<RegisterRequest>(
        pipe(
          tap(() => patchState(store, { isLoading: true, error: null })),
          switchMap(payload =>
            authService.register(payload).pipe(
              tap(() => {
                patchState(store, { isAuthenticated: true, isLoading: false });
                toastService.success('Account created successfully!');
                void router.navigate(['/orders']);
              }),
              catchError((err: { error?: { message?: string } }) => {
                patchState(store, {
                  isLoading: false,
                  error: err.error?.message ?? 'Registration failed',
                });
                return EMPTY;
              })
            )
          )
        )
      ),

      logout(): void {
        authService.logout();
        patchState(store, { isAuthenticated: false });
        void router.navigate(['/auth/login']);
      },
    })
  )
);
